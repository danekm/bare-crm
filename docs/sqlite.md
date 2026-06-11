# SQLite Storage

SQLite is a first-class Storage API implementation target.

Use it for:

- local-first installs
- desktop apps
- embedded apps
- simple self-hosting
- fast tests with durable files

The SQLite implementation should use explicit schema, indexes, transactions, and the shared Storage
API conformance suite.

## Current Adapter

The package exports:

```ts
import { createCrmKernel } from "@bare-crm/kernel"
import { createSqliteStorage } from "@bare-crm/kernel/sqlite"

const storage = createSqliteStorage("./bare-crm.db")
const crm = createCrmKernel({ storage })
```

For tests and embedded prototypes:

```ts
import { createSqliteMemoryStorage } from "@bare-crm/kernel/sqlite"

const storage = createSqliteMemoryStorage()
```

The adapter stores canonical records and events as JSON, while keeping stable fields in columns for
indexes:

- `workspace_id`
- `type`
- `id`
- `version`
- `updated_at`
- `archived_at`
- `owner_id`
- `source`

This keeps the first adapter small and flexible without forcing the kernel to know about SQL shape.
The schema can add generated columns, FTS tables, or materialized projections later without changing
the Write API, Read API, or Storage API.

## Guarantees

- every kernel operation runs inside an explicit SQLite transaction
- optimistic writes use the shared `expectedVersion` contract
- events and idempotency results are persisted in the same transaction as records
- the adapter runs through the shared Storage API conformance test

## Non-Goals

- no CRM-specific SQL tables per entity yet
- no full-text search table yet
- no migrations framework yet
- no policy or workflow logic inside storage
