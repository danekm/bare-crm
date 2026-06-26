import type { AnyRecord, CrmEvent, EventListInput, SearchInput } from "./types.ts"
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

export type PostgresMigration = {
  version: string
  name: string
  statements: string[]
}

export type PostgresMigrationStatus = {
  adapter: "postgres"
  currentVersion: string | null
  applied: string[]
  pending: Array<Pick<PostgresMigration, "version" | "name">>
}

export type PostgresMigrationResult = PostgresMigrationStatus & {
  appliedNow: Array<Pick<PostgresMigration, "version" | "name">>
  dryRun: boolean
}

const postgresMigrations: PostgresMigration[] = [{
  version: "001",
  name: "initial_schema",
  statements: [
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
        name text not null,
        write_id text not null,
        record_type text not null,
        record_id text not null,
        source text not null,
        actor_id text,
        correlation_id text,
        causation_id text,
        idempotency_key text,
        occurred_at timestamptz not null,
        event_json jsonb not null
      )
    `,
    "create index if not exists bare_crm_events_workspace_occurred_idx on bare_crm_events(workspace_id, occurred_at desc)",
    "create index if not exists bare_crm_events_workspace_name_idx on bare_crm_events(workspace_id, name)",
    "create index if not exists bare_crm_events_workspace_record_idx on bare_crm_events(workspace_id, record_type, record_id)",
    "create index if not exists bare_crm_events_workspace_correlation_idx on bare_crm_events(workspace_id, correlation_id)",
    `
      create table if not exists bare_crm_idempotency (
        key text primary key,
        result_json jsonb not null
      )
    `,
    `
      create table if not exists bare_crm_migrations (
        version text primary key,
        name text not null,
        applied_at timestamptz not null
      )
    `,
  ],
}]

const schemaStatements = postgresMigrations.flatMap((migration) => migration.statements)

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

export function getPostgresMigrations(): PostgresMigration[] {
  return postgresMigrations.map((migration) => ({
    ...migration,
    statements: [...migration.statements],
  }))
}

export async function installPostgresSchema(client: PostgresExecutor): Promise<void> {
  await migratePostgresClient(client)
}

export async function getPostgresMigrationStatus(
  connection: PostgresConnection | PostgresPool,
): Promise<PostgresMigrationStatus> {
  const client = await acquireConnection(connection)
  try {
    return await postgresMigrationStatus(client)
  } finally {
    await releaseConnection(client, connection)
  }
}

export async function migratePostgresDatabase(
  connection: PostgresConnection | PostgresPool,
  options: { dryRun?: boolean; now?: () => Date } = {},
): Promise<PostgresMigrationResult> {
  const client = await acquireConnection(connection)
  try {
    if (options.dryRun) {
      const status = await postgresMigrationStatus(client)
      return { ...status, appliedNow: [], dryRun: true }
    }

    const appliedNow = await migratePostgresClient(client, options.now)
    const status = await postgresMigrationStatus(client)
    return { ...status, appliedNow, dryRun: false }
  } finally {
    await releaseConnection(client, connection)
  }
}

async function migratePostgresClient(
  client: PostgresExecutor,
  now: () => Date = () => new Date(),
): Promise<Array<Pick<PostgresMigration, "version" | "name">>> {
  await execute(client, "begin")
  const appliedNow: Array<Pick<PostgresMigration, "version" | "name">> = []

  try {
    await installPostgresMigrationLedger(client)
    const applied = new Set(await readAppliedPostgresMigrationVersions(client))

    for (const migration of postgresMigrations) {
      if (applied.has(migration.version)) continue

      for (const statement of migration.statements) {
        await execute(client, statement)
      }
      await execute(
        client,
        `
          insert into bare_crm_migrations (version, name, applied_at)
          values ($1, $2, $3)
        `,
        [migration.version, migration.name, now().toISOString()],
      )
      appliedNow.push({ version: migration.version, name: migration.name })
    }

    await execute(client, "commit")
    return appliedNow
  } catch (error) {
    await execute(client, "rollback")
    throw error
  }
}

async function installPostgresMigrationLedger(client: PostgresExecutor): Promise<void> {
  await execute(
    client,
    `
      create table if not exists bare_crm_migrations (
        version text primary key,
        name text not null,
        applied_at timestamptz not null
      )
    `,
  )
}

async function postgresMigrationStatus(
  client: PostgresExecutor,
): Promise<PostgresMigrationStatus> {
  const applied = await postgresMigrationLedgerExists(client)
    ? await readAppliedPostgresMigrationVersions(client)
    : []
  const appliedSet = new Set(applied)
  const pending = postgresMigrations
    .filter((migration) => !appliedSet.has(migration.version))
    .map(({ version, name }) => ({ version, name }))

  return {
    adapter: "postgres",
    currentVersion: applied.at(-1) ?? null,
    applied,
    pending,
  }
}

async function postgresMigrationLedgerExists(client: PostgresExecutor): Promise<boolean> {
  const rows = await queryRows(
    client,
    "select to_regclass('bare_crm_migrations') as migration_table",
  )
  return Boolean(rows[0]?.migration_table)
}

async function readAppliedPostgresMigrationVersions(client: PostgresExecutor): Promise<string[]> {
  const rows = await queryRows(
    client,
    `
      select version
      from bare_crm_migrations
      order by version asc
    `,
  )
  return rows.map((row) => String(row.version))
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
        insert into bare_crm_events (
          workspace_id,
          id,
          name,
          write_id,
          record_type,
          record_id,
          source,
          actor_id,
          correlation_id,
          causation_id,
          idempotency_key,
          occurred_at,
          event_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      `,
        eventParams(event),
      )
    },

    async listEvents(input) {
      const rows = await queryRows(
        client,
        buildEventListSql(input),
        buildEventListParams(input),
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

function buildEventListSql(input: EventListInput): string {
  const clauses = ["workspace_id = $1"]
  let nextParam = 2

  if (input.name) clauses.push(`name = $${nextParam++}`)
  if (input.record) {
    clauses.push(`record_type = $${nextParam++}`)
    clauses.push(`record_id = $${nextParam++}`)
  }
  if (input.writeId) clauses.push(`write_id = $${nextParam++}`)
  if (input.actorId) clauses.push(`actor_id = $${nextParam++}`)
  if (input.source) clauses.push(`source = $${nextParam++}`)
  if (input.correlationId) clauses.push(`correlation_id = $${nextParam++}`)
  if (input.causationId) clauses.push(`causation_id = $${nextParam++}`)
  if (input.idempotencyKey) clauses.push(`idempotency_key = $${nextParam++}`)

  return `
    select event_json
    from bare_crm_events
    where ${clauses.join(" and ")}
    order by occurred_at desc, id desc
    limit $${nextParam}
  `
}

function buildEventListParams(input: EventListInput): unknown[] {
  const params: unknown[] = [input.workspaceId]
  if (input.name) params.push(input.name)
  if (input.record) {
    params.push(input.record.type)
    params.push(input.record.id)
  }
  if (input.writeId) params.push(input.writeId)
  if (input.actorId) params.push(input.actorId)
  if (input.source) params.push(input.source)
  if (input.correlationId) params.push(input.correlationId)
  if (input.causationId) params.push(input.causationId)
  if (input.idempotencyKey) params.push(input.idempotencyKey)
  params.push(input.limit ?? 100)
  return params
}

function eventParams(event: CrmEvent): unknown[] {
  return [
    event.workspaceId,
    event.id,
    event.name,
    event.writeId,
    event.recordRef.type,
    event.recordRef.id,
    event.source,
    event.actorId ?? null,
    event.correlationId ?? null,
    event.causationId ?? null,
    event.idempotencyKey ?? null,
    event.occurredAt,
    JSON.stringify(event),
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
