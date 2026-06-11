# Conformance Tests

Storage API implementations should pass the same behavior suite.

```ts
runStorageConformanceSuite(createMemoryStorage())
runStorageConformanceSuite(createSqliteStorage(path))
runStorageConformanceSuite(createPostgresStorage(connection))
```

## Required Coverage

- record get/put
- search
- archive filtering
- Event Log append/list
- idempotency lookups
- optimistic concurrency
- workspace isolation

The current suite starts with in-memory storage. SQLite and Postgres/Supabase should reuse and
expand it.
