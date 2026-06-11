import { type BindValue, Database } from "jsr:@db/sqlite"
import type { AnyRecord, CrmEvent, EventListInput, SearchInput } from "./types.ts"
import { type StorageApi, StorageConflictError, type StorageTx } from "./storage.ts"

type Row = Record<string, unknown>

export type SqliteStorage = StorageApi & {
  close(): void
}

export function createSqliteStorage(path: string | URL): SqliteStorage {
  const db = new Database(path)
  installSchema(db)

  return {
    async transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> {
      db.exec("begin immediate")
      try {
        const result = await fn(createTx(db))
        db.exec("commit")
        return result
      } catch (error) {
        db.exec("rollback")
        throw error
      }
    },

    close() {
      db.close()
    },
  }
}

export function createSqliteMemoryStorage(): SqliteStorage {
  return createSqliteStorage(":memory:")
}

function installSchema(db: Database): void {
  db.exec(`
    create table if not exists records (
      workspace_id text not null,
      type text not null,
      id text not null,
      version integer not null,
      updated_at text not null,
      archived_at text,
      owner_id text,
      source text not null,
      text_index text not null,
      record_json text not null,
      primary key (workspace_id, type, id)
    )
  `)
  db.exec("create index if not exists records_workspace_type_idx on records(workspace_id, type)")
  db.exec(
    "create index if not exists records_workspace_updated_idx on records(workspace_id, updated_at)",
  )
  db.exec(
    "create index if not exists records_workspace_archived_idx on records(workspace_id, archived_at)",
  )
  db.exec(
    "create index if not exists records_workspace_owner_idx on records(workspace_id, owner_id)",
  )
  db.exec(
    "create index if not exists records_workspace_source_idx on records(workspace_id, source)",
  )

  db.exec(`
    create table if not exists events (
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
      occurred_at text not null,
      event_json text not null
    )
  `)
  db.exec(
    "create index if not exists events_workspace_occurred_idx on events(workspace_id, occurred_at)",
  )
  db.exec("create index if not exists events_workspace_name_idx on events(workspace_id, name)")
  db.exec(
    "create index if not exists events_workspace_record_idx on events(workspace_id, record_type, record_id)",
  )
  db.exec(
    "create index if not exists events_workspace_correlation_idx on events(workspace_id, correlation_id)",
  )

  db.exec(`
    create table if not exists idempotency (
      key text primary key,
      result_json text not null
    )
  `)
}

function createTx(db: Database): StorageTx {
  return {
    async get(ref) {
      const row = db.prepare(`
        select record_json
        from records
        where workspace_id = ? and type = ? and id = ?
      `).get(ref.workspaceId, ref.type, ref.id) as Row | undefined

      return row ? parseJson<AnyRecord>(row.record_json) : null
    },

    async put(record, options) {
      const current = db.prepare(`
        select version
        from records
        where workspace_id = ? and type = ? and id = ?
      `).get(record.workspaceId, record.type, record.id) as Row | undefined

      if (
        options?.expectedVersion !== undefined &&
        (current?.version ?? 0) !== options.expectedVersion
      ) {
        throw new StorageConflictError(record)
      }

      db.prepare(`
        insert into records (
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
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(workspace_id, type, id) do update set
          version = excluded.version,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at,
          owner_id = excluded.owner_id,
          source = excluded.source,
          text_index = excluded.text_index,
          record_json = excluded.record_json
      `).run(
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
      )
    },

    async search(input) {
      const rows = db.prepare(buildRecordSearchSql(input)).all(
        ...buildRecordSearchParams(input),
      ) as Row[]
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
      db.prepare(`
        insert into events (
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
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      )
    },

    async listEvents(input) {
      const rows = db.prepare(buildEventListSql(input)).all(
        ...buildEventListParams(input),
      ) as Row[]

      return rows
        .reverse()
        .map((row) => parseJson<CrmEvent>(row.event_json))
    },

    async getIdempotencyResult(key) {
      const row = db.prepare(`
        select result_json
        from idempotency
        where key = ?
      `).get(key) as Row | undefined

      return row ? parseJson<AnyRecord>(row.result_json) : null
    },

    async saveIdempotencyResult(key, result) {
      db.prepare(`
        insert into idempotency (key, result_json)
        values (?, ?)
        on conflict(key) do update set result_json = excluded.result_json
      `).run(key, JSON.stringify(result))
    },
  }
}

function buildRecordSearchSql(input: SearchInput): string {
  const clauses = ["workspace_id = ?"]
  if (!input.includeArchived) clauses.push("archived_at is null")
  if (input.type) clauses.push("type = ?")
  if (input.ownerId) clauses.push("owner_id = ?")
  if (input.source) clauses.push("source = ?")

  return `
    select record_json
    from records
    where ${clauses.join(" and ")}
    order by updated_at desc, id asc
  `
}

function buildRecordSearchParams(input: SearchInput): BindValue[] {
  const params: BindValue[] = [input.workspaceId]
  if (input.type) params.push(input.type)
  if (input.ownerId) params.push(input.ownerId)
  if (input.source) params.push(input.source)
  return params
}

function buildEventListSql(input: EventListInput): string {
  const clauses = ["workspace_id = ?"]
  if (input.name) clauses.push("name = ?")
  if (input.record) {
    clauses.push("record_type = ?")
    clauses.push("record_id = ?")
  }
  if (input.writeId) clauses.push("write_id = ?")
  if (input.actorId) clauses.push("actor_id = ?")
  if (input.source) clauses.push("source = ?")
  if (input.correlationId) clauses.push("correlation_id = ?")
  if (input.causationId) clauses.push("causation_id = ?")
  if (input.idempotencyKey) clauses.push("idempotency_key = ?")

  return `
    select event_json
    from events
    where ${clauses.join(" and ")}
    order by occurred_at desc, rowid desc
    limit ?
  `
}

function buildEventListParams(input: EventListInput): BindValue[] {
  const params: BindValue[] = [input.workspaceId]
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

function parseJson<T>(value: unknown): T {
  if (typeof value !== "string") {
    throw new TypeError("Expected SQLite JSON column to be a string")
  }
  return JSON.parse(value) as T
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
