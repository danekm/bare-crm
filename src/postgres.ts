import type { AnyRecord, CrmEvent, SearchInput } from "./types.ts"
import { type StorageApi, StorageConflictError, type StorageTx } from "./storage.ts"

type Row = Record<string, unknown>

export type PostgresQueryResult<T extends Row = Row> = {
  rows: T[]
}

export type PostgresExecutor = {
  queryObject?<T extends Row = Row>(
    query: string | { text: string; args?: unknown[] },
    args?: unknown[],
  ): Promise<PostgresQueryResult<T>>
  query?<T extends Row = Row>(
    query: string,
    args?: unknown[],
  ): Promise<PostgresQueryResult<T>>
}

export type PostgresConnection = PostgresExecutor & {
  release?: () => void | Promise<void>
  close?: () => void | Promise<void>
  end?: () => void | Promise<void>
}

export type PostgresPool = {
  connect(): Promise<PostgresConnection>
}

export type PostgresStorageOptions = {
  connection: PostgresConnection | PostgresPool
  installSchema?: boolean
}

export type PostgresStorage = StorageApi & {
  installSchema(): Promise<void>
  close(): Promise<void>
}

const schemaStatements = [
  `
    create table if not exists bare_crm_records (
      workspace_id text not null,
      type text not null,
      id text not null,
      version integer not null,
      updated_at timestamptz not null,
      archived_at timestamptz,
      owner_id text,
      source text not null,
      text_index text not null,
      record_json jsonb not null,
      primary key (workspace_id, type, id)
    )
  `,
  "create index if not exists bare_crm_records_workspace_type_idx on bare_crm_records(workspace_id, type)",
  "create index if not exists bare_crm_records_workspace_updated_idx on bare_crm_records(workspace_id, updated_at desc)",
  "create index if not exists bare_crm_records_workspace_archived_idx on bare_crm_records(workspace_id, archived_at)",
  "create index if not exists bare_crm_records_workspace_owner_idx on bare_crm_records(workspace_id, owner_id)",
  "create index if not exists bare_crm_records_workspace_source_idx on bare_crm_records(workspace_id, source)",
  `
    create table if not exists bare_crm_events (
      workspace_id text not null,
      id text primary key,
      occurred_at timestamptz not null,
      event_json jsonb not null
    )
  `,
  "create index if not exists bare_crm_events_workspace_occurred_idx on bare_crm_events(workspace_id, occurred_at desc)",
  `
    create table if not exists bare_crm_idempotency (
      key text primary key,
      result_json jsonb not null
    )
  `,
]

export function createPostgresStorage(options: PostgresStorageOptions): PostgresStorage {
  const connection = options.connection

  return {
    async transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> {
      const client = await acquireConnection(connection)
      try {
        if (options.installSchema) await installPostgresSchema(client)
        await execute(client, "begin")
        try {
          const result = await fn(createTx(client))
          await execute(client, "commit")
          return result
        } catch (error) {
          await execute(client, "rollback")
          throw error
        }
      } finally {
        await releaseConnection(client, connection)
      }
    },

    async installSchema() {
      const client = await acquireConnection(connection)
      try {
        await installPostgresSchema(client)
      } finally {
        await releaseConnection(client, connection)
      }
    },

    async close() {
      if ("close" in connection) await connection.close?.()
      if ("end" in connection) await connection.end?.()
    },
  }
}

export function getPostgresSchemaSql(): string[] {
  return [...schemaStatements]
}

export async function installPostgresSchema(client: PostgresExecutor): Promise<void> {
  for (const statement of schemaStatements) {
    await execute(client, statement)
  }
}

function createTx(client: PostgresExecutor): StorageTx {
  return {
    async get(ref) {
      const rows = await queryRows(
        client,
        `
        select record_json
        from bare_crm_records
        where workspace_id = $1 and type = $2 and id = $3
      `,
        [ref.workspaceId, ref.type, ref.id],
      )

      return rows[0] ? parseJson<AnyRecord>(rows[0].record_json) : null
    },

    async put(record, options) {
      const current = await queryRows(
        client,
        `
        select version
        from bare_crm_records
        where workspace_id = $1 and type = $2 and id = $3
        for update
      `,
        [record.workspaceId, record.type, record.id],
      )

      if (
        options?.expectedVersion !== undefined &&
        Number(current[0]?.version ?? 0) !== options.expectedVersion
      ) {
        throw new StorageConflictError(record)
      }

      try {
        if (current.length === 0) {
          await execute(
            client,
            `
            insert into bare_crm_records (
              workspace_id,
              type,
              id,
              version,
              updated_at,
              archived_at,
              owner_id,
              source,
              text_index,
              record_json
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
          `,
            recordParams(record),
          )
        } else {
          await execute(
            client,
            `
            update bare_crm_records
            set
              version = $4,
              updated_at = $5,
              archived_at = $6,
              owner_id = $7,
              source = $8,
              text_index = $9,
              record_json = $10::jsonb
            where workspace_id = $1 and type = $2 and id = $3
          `,
            recordParams(record),
          )
        }
      } catch (error) {
        if (isUniqueViolation(error)) throw new StorageConflictError(record)
        throw error
      }
    },

    async search(input) {
      const rows = await queryRows(
        client,
        buildRecordSearchSql(input),
        buildRecordSearchParams(input),
      )
      const text = input.text?.toLowerCase()
      const limit = input.limit ?? 50

      return rows
        .map((row) => parseJson<AnyRecord>(row.record_json))
        .filter((record) => tagsMatch(record, input.tags))
        .filter((record) => externalRefMatches(record, input.externalRef))
        .filter((record) => !text || JSON.stringify(record).toLowerCase().includes(text))
        .slice(0, limit)
    },

    async appendEvent(event) {
      await execute(
        client,
        `
        insert into bare_crm_events (workspace_id, id, occurred_at, event_json)
        values ($1, $2, $3, $4::jsonb)
      `,
        [event.workspaceId, event.id, event.occurredAt, JSON.stringify(event)],
      )
    },

    async listEvents(input) {
      const rows = await queryRows(
        client,
        `
        select event_json
        from bare_crm_events
        where workspace_id = $1
        order by occurred_at desc, id desc
        limit $2
      `,
        [input.workspaceId, input.limit ?? 100],
      )

      return rows
        .reverse()
        .map((row) => parseJson<CrmEvent>(row.event_json))
    },

    async getIdempotencyResult(key) {
      const rows = await queryRows(
        client,
        `
        select result_json
        from bare_crm_idempotency
        where key = $1
      `,
        [key],
      )

      return rows[0] ? parseJson<AnyRecord>(rows[0].result_json) : null
    },

    async saveIdempotencyResult(key, result) {
      await execute(
        client,
        `
        insert into bare_crm_idempotency (key, result_json)
        values ($1, $2::jsonb)
        on conflict(key) do update set result_json = excluded.result_json
      `,
        [key, JSON.stringify(result)],
      )
    },
  }
}

function buildRecordSearchSql(input: SearchInput): string {
  const clauses = ["workspace_id = $1"]
  let nextParam = 2

  if (!input.includeArchived) clauses.push("archived_at is null")
  if (input.type) clauses.push(`type = $${nextParam++}`)
  if (input.ownerId) clauses.push(`owner_id = $${nextParam++}`)
  if (input.source) clauses.push(`source = $${nextParam++}`)
  if (input.text) clauses.push(`text_index like $${nextParam++}`)

  return `
    select record_json
    from bare_crm_records
    where ${clauses.join(" and ")}
    order by updated_at desc, id asc
  `
}

function buildRecordSearchParams(input: SearchInput): unknown[] {
  const params: unknown[] = [input.workspaceId]
  if (input.type) params.push(input.type)
  if (input.ownerId) params.push(input.ownerId)
  if (input.source) params.push(input.source)
  if (input.text) params.push(`%${escapeLike(input.text.toLowerCase())}%`)
  return params
}

function recordParams(record: AnyRecord): unknown[] {
  return [
    record.workspaceId,
    record.type,
    record.id,
    record.version,
    record.updatedAt,
    record.archivedAt ?? null,
    record.ownerId ?? null,
    record.source,
    JSON.stringify(record).toLowerCase(),
    JSON.stringify(record),
  ]
}

async function acquireConnection(
  connection: PostgresConnection | PostgresPool,
): Promise<PostgresConnection> {
  if ("connect" in connection) return await connection.connect()
  return connection
}

async function releaseConnection(
  client: PostgresConnection,
  source: PostgresConnection | PostgresPool,
): Promise<void> {
  if ("connect" in source) {
    await client.release?.()
  }
}

async function execute(
  client: PostgresExecutor,
  query: string,
  args: unknown[] = [],
): Promise<void> {
  await queryRows(client, query, args)
}

async function queryRows<T extends Row = Row>(
  client: PostgresExecutor,
  query: string,
  args: unknown[] = [],
): Promise<T[]> {
  if (client.queryObject) {
    return (await client.queryObject<T>(query, args)).rows
  }
  if (client.query) {
    return (await client.query<T>(query, args)).rows
  }
  throw new TypeError("Postgres client must provide queryObject() or query()")
}

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T
  if (typeof value === "object" && value !== null) return value as T
  throw new TypeError("Expected Postgres JSON column to be a string or object")
}

function tagsMatch(record: AnyRecord, tags?: string[]): boolean {
  if (!tags?.length) return true
  return tags.every((tag) => record.tags?.includes(tag))
}

function externalRefMatches(
  record: AnyRecord,
  externalRef?: Pick<NonNullable<AnyRecord["externalRefs"]>[number], "system" | "id">,
): boolean {
  if (!externalRef) return true
  return Boolean(
    record.externalRefs?.some((candidate) =>
      candidate.system === externalRef.system && candidate.id === externalRef.id
    ),
  )
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  )
}
