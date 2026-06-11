import type {
  AnyRecord,
  CrmEvent,
  EntityRef,
  EntityType,
  EventListInput,
  SearchInput,
} from "./types.ts"

type StoreKey = `${string}:${EntityType}:${string}`

export type StorageApi = {
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>
}

export type StorageTx = {
  get(ref: EntityRef & { workspaceId: string }): Promise<AnyRecord | null>
  put(record: AnyRecord, options?: { expectedVersion?: number }): Promise<void>
  search(input: SearchInput): Promise<AnyRecord[]>
  appendEvent(event: CrmEvent): Promise<void>
  listEvents(input: EventListInput): Promise<CrmEvent[]>
  getIdempotencyResult(key: string): Promise<AnyRecord | null>
  saveIdempotencyResult(key: string, result: AnyRecord): Promise<void>
}

export function createMemoryStorage(): StorageApi {
  let records = new Map<StoreKey, AnyRecord>()
  let events: CrmEvent[] = []
  let idempotency = new Map<string, AnyRecord>()

  return {
    async transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> {
      const recordsSnapshot = new Map(records)
      const eventsSnapshot = [...events]
      const idempotencySnapshot = new Map(idempotency)

      const tx: StorageTx = {
        async get(ref) {
          return records.get(key(ref)) ?? null
        },

        async put(record, options) {
          const current = records.get(key(record))
          if (
            options?.expectedVersion !== undefined &&
            (current?.version ?? 0) !== options.expectedVersion
          ) {
            throw new StorageConflictError(record)
          }

          records.set(key(record), record)
        },

        async search(input) {
          const text = input.text?.toLowerCase()
          const limit = input.limit ?? 50

          return Array.from(records.values())
            .filter((record) => record.workspaceId === input.workspaceId)
            .filter((record) => input.includeArchived || !record.archivedAt)
            .filter((record) => !input.type || record.type === input.type)
            .filter((record) => !input.ownerId || record.ownerId === input.ownerId)
            .filter((record) => !input.source || record.source === input.source)
            .filter((record) => tagsMatch(record, input.tags))
            .filter((record) => externalRefMatches(record, input.externalRef))
            .filter((record) => !text || JSON.stringify(record).toLowerCase().includes(text))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
            .slice(0, limit)
        },

        async appendEvent(event) {
          events.push(event)
        },

        async listEvents(input) {
          return events
            .filter((event) => event.workspaceId === input.workspaceId)
            .slice(-(input.limit ?? 100))
        },

        async getIdempotencyResult(key) {
          return idempotency.get(key) ?? null
        },

        async saveIdempotencyResult(key, result) {
          idempotency.set(key, result)
        },
      }

      try {
        return await fn(tx)
      } catch (error) {
        records = recordsSnapshot
        events = eventsSnapshot
        idempotency = idempotencySnapshot
        throw error
      }
    },
  }
}

export class StorageConflictError extends Error {
  constructor(record: AnyRecord) {
    super(`Record version conflict: ${record.workspaceId}:${record.type}:${record.id}`)
    this.name = "StorageConflictError"
  }
}

function key(record: { workspaceId: string; type: EntityType; id: string }): StoreKey {
  return `${record.workspaceId}:${record.type}:${record.id}`
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
