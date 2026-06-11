# Conformance Tests

Storage API implementations should pass the same behavior suite. Kernel behavior should also run
against every first-class storage adapter so storage differences cannot silently change CRM
behavior.

```ts
runStorageConformanceSuite(createMemoryStorage())
runStorageConformanceSuite(createSqliteStorage(path))
runStorageConformanceSuite(createPostgresStorage(connection))
```

## Current Coverage

The current suite runs against in-memory storage, SQLite, and the Postgres adapter.

Kernel coverage includes:

- every core entity create path
- Read API search and get behavior
- update identity preservation and version increments
- duplicate create ID conflicts
- relation endpoint validation
- relation listing from both endpoints
- archived records and archived relations
- timeline related-record behavior
- workspace isolation
- tags, owner, source, and external reference filters
- Event Log workspace scoping and limits
- execution context workspace matching
- idempotency replay behavior
- idempotency scoping by workspace and write name

Storage coverage includes:

- record get/put
- composable search filters
- archive filtering
- Event Log append/list
- idempotency lookups
- optimistic concurrency
- workspace isolation
- type isolation
- transaction rollback

New storage implementations should reuse and expand the same suites.
