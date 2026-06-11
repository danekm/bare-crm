import { createPostgresStorage, type PostgresConnection } from "../src/postgres.ts"
import type { StorageApi } from "../src/index.ts"
import type { AnyRecord, CrmEvent } from "../src/types.ts"

type Row = Record<string, unknown>

type StoreKey = `${string}:${string}:${string}`

export type FakePostgresStorage = StorageApi & {
  close(): Promise<void>
  queries: string[]
}

export function createFakePostgresStorage(): FakePostgresStorage {
  const client = new FakePostgresClient()
  const storage = createPostgresStorage({ connection: client })

  return {
    ...storage,
    queries: client.queries,
  }
}

class FakePostgresClient implements PostgresConnection {
  records = new Map<StoreKey, AnyRecord>()
  events: CrmEvent[] = []
  idempotency = new Map<string, AnyRecord>()
  queries: string[] = []

  #snapshot:
    | {
      records: Map<StoreKey, AnyRecord>
      events: CrmEvent[]
      idempotency: Map<string, AnyRecord>
    }
    | undefined

  async queryObject<T extends Row = Row>(
    query: string | { text: string; args?: unknown[] },
    args: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    const queryText = typeof query === "string" ? query : query.text
    const queryArgs = typeof query === "string" ? args : query.args ?? args
    const normalized = normalize(queryText)
    this.queries.push(normalized)

    if (normalized === "begin") {
      this.#snapshot = {
        records: new Map(this.records),
        events: [...this.events],
        idempotency: new Map(this.idempotency),
      }
      return { rows: [] }
    }
    if (normalized === "commit") {
      this.#snapshot = undefined
      return { rows: [] }
    }
    if (normalized === "rollback") {
      if (this.#snapshot) {
        this.records = this.#snapshot.records
        this.events = this.#snapshot.events
        this.idempotency = this.#snapshot.idempotency
        this.#snapshot = undefined
      }
      return { rows: [] }
    }
    if (normalized.startsWith("create ")) return { rows: [] }

    if (normalized.startsWith("select version from bare_crm_records")) {
      const record = this.records.get(recordKey(queryArgs[0], queryArgs[1], queryArgs[2]))
      return rows(record ? [{ version: record.version }] : [])
    }

    if (normalized.startsWith("insert into bare_crm_records")) {
      const record = parseJson<AnyRecord>(queryArgs[9])
      const key = recordKey(record.workspaceId, record.type, record.id)
      if (this.records.has(key)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        })
      }
      this.records.set(key, record)
      return { rows: [] }
    }

    if (normalized.startsWith("update bare_crm_records")) {
      const record = parseJson<AnyRecord>(queryArgs[9])
      this.records.set(recordKey(record.workspaceId, record.type, record.id), record)
      return { rows: [] }
    }

    if (normalized.startsWith("select record_json from bare_crm_records")) {
      if (normalized.includes("and id = $3")) {
        const record = this.records.get(recordKey(queryArgs[0], queryArgs[1], queryArgs[2]))
        return rows(record ? [{ record_json: record }] : [])
      }

      let records = Array.from(this.records.values())
        .filter((record) => record.workspaceId === queryArgs[0])

      if (normalized.includes("archived_at is null")) {
        records = records.filter((record) => !record.archivedAt)
      }

      let nextArg = 1
      if (normalized.includes("type = $")) {
        records = records.filter((record) => record.type === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("owner_id = $")) {
        records = records.filter((record) => record.ownerId === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("source = $")) {
        records = records.filter((record) => record.source === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("text_index like $")) {
        const text = String(queryArgs[nextArg]).replaceAll("%", "")
        records = records.filter((record) => JSON.stringify(record).toLowerCase().includes(text))
      }

      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      return rows(records.map((record) => ({ record_json: record })))
    }

    if (normalized.startsWith("insert into bare_crm_events")) {
      this.events.push(parseJson<CrmEvent>(queryArgs[12]))
      return { rows: [] }
    }

    if (normalized.startsWith("select event_json from bare_crm_events")) {
      let events = this.events
        .filter((event) => event.workspaceId === queryArgs[0])

      let nextArg = 1
      if (normalized.includes("name = $")) {
        events = events.filter((event) => event.name === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("record_type = $")) {
        events = events.filter((event) => event.recordRef.type === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("record_id = $")) {
        events = events.filter((event) => event.recordRef.id === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("write_id = $")) {
        events = events.filter((event) => event.writeId === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("actor_id = $")) {
        events = events.filter((event) => event.actorId === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("source = $")) {
        events = events.filter((event) => event.source === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("correlation_id = $")) {
        events = events.filter((event) => event.correlationId === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("causation_id = $")) {
        events = events.filter((event) => event.causationId === queryArgs[nextArg])
        nextArg++
      }
      if (normalized.includes("idempotency_key = $")) {
        events = events.filter((event) => event.idempotencyKey === queryArgs[nextArg])
        nextArg++
      }

      const eventRows = events
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
        .slice(0, Number(queryArgs[nextArg]))
        .map((event) => ({ event_json: event }))

      return rowsResult(eventRows)
    }

    if (normalized.startsWith("select result_json from bare_crm_idempotency")) {
      const result = this.idempotency.get(String(queryArgs[0]))
      return rows(result ? [{ result_json: result }] : [])
    }

    if (normalized.startsWith("insert into bare_crm_idempotency")) {
      this.idempotency.set(String(queryArgs[0]), parseJson<AnyRecord>(queryArgs[1]))
      return { rows: [] }
    }

    throw new Error(`Unhandled fake Postgres query: ${normalized}`)
  }
}

function normalize(query: string): string {
  return query.replace(/\s+/g, " ").trim()
}

function recordKey(workspaceId: unknown, type: unknown, id: unknown): StoreKey {
  return `${String(workspaceId)}:${String(type)}:${String(id)}`
}

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T
  return value as T
}

function rows<T extends Row>(rows: Row[]): { rows: T[] } {
  return rowsResult(rows)
}

function rowsResult<T extends Row>(rows: Row[]): { rows: T[] } {
  return { rows: rows as T[] }
}
