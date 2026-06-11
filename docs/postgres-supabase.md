# Postgres And Supabase Storage

Postgres/Supabase is a first-class Storage API implementation target.

Use it for:

- hosted deployments
- team/workspace usage
- production apps
- Supabase-backed projects

The implementation should work with standard Postgres. Supabase-specific features should be optional
and isolated behind configuration.

## Current Adapter

The package exports the Postgres implementation from a subpath:

```ts
import { createCrmKernel } from "@bare-crm/kernel"
import { createPostgresStorage } from "@bare-crm/kernel/postgres"

const storage = createPostgresStorage({
  connection: postgresClientOrPool,
  installSchema: true,
})

const crm = createCrmKernel({ storage })
```

The adapter accepts a small client/pool surface instead of owning a specific driver:

```ts
type PostgresExecutor = {
  queryObject?(query, args?): Promise<{ rows: unknown[] }>
  query?(query, args?): Promise<{ rows: unknown[] }>
}

type PostgresPool = {
  connect(): Promise<PostgresConnection>
}
```

This keeps the kernel compatible with Deno Postgres clients, node-postgres-style clients, and direct
Supabase Postgres connections.

## Schema

The adapter creates explicit tables:

- `bare_crm_records`
- `bare_crm_events`
- `bare_crm_idempotency`

Records and events are stored as canonical `jsonb`, while stable index columns stay relational:

- `workspace_id`
- `type`
- `id`
- `version`
- `updated_at`
- `archived_at`
- `owner_id`
- `source`
- `text_index`

The exported `getPostgresSchemaSql()` helper returns the schema statements for migrations or manual
review.

## Guarantees

- every kernel operation runs in an explicit Postgres transaction
- existing records are locked with `for update` before optimistic version checks
- duplicate create IDs map to `StorageConflictError`
- events and idempotency rows are written in the same transaction as records
- the adapter runs through the same kernel and Storage API behavior suites as memory and SQLite

## Supabase Notes

The first adapter intentionally uses plain Postgres features. Supabase-specific auth, row-level
security policies, storage buckets, and realtime subscriptions should live in optional layers or
configuration rather than changing the kernel contract.
