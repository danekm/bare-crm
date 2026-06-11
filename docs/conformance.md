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
- Event Log audit-field filters
- execution context workspace matching
- strict permission mode context and actor requirements
- strict permission mode read/write capability enforcement
- import create/match/update/dry-run by external reference
- import/export helper behavior in strict capability mode
- export through Read API with JSON Lines serialization
- plugin manifest validation and example manifest coverage
- idempotency replay behavior
- idempotency scoping by workspace and write name

Storage coverage includes:

- record get/put
- composable search filters
- archive filtering
- Event Log append/list
- Event Log audit-field filters
- idempotency lookups
- optimistic concurrency
- workspace isolation
- type isolation
- transaction rollback

New storage implementations should reuse and expand the same suites.
