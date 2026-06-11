# Storage API

The Storage API is the small persistence contract used by the kernel.

The kernel should not know whether records live in memory, SQLite, or Postgres/Supabase.

## Implementations

- in-memory: tests and examples
- SQLite: local-first, desktop, embedded, simple self-hosting
- Postgres/Supabase: hosted/team production use

## Contract

```ts
type StorageApi = {
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>
}

type StorageTx = {
  get(ref): Promise<AnyRecord | null>
  put(record, options): Promise<void>
  search(input): Promise<AnyRecord[]>
  appendEvent(event): Promise<void>
  listEvents(input): Promise<CrmEvent[]>
  getIdempotencyResult(key): Promise<AnyRecord | null>
  saveIdempotencyResult(key, result): Promise<void>
}
```

All implementations should pass the same conformance tests.
