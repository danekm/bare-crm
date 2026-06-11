# Install

Bare CRM has two install surfaces:

- package install for builders embedding the kernel
- CLI install for local operators

It does not have a UI installer yet. Bare CRM is a kernel and operator tool first, not a packaged
CRM app.

## Requirements

- Deno
- SQLite native support when using SQLite storage or the `crm` CLI SQLite commands
- A Postgres client/pool supplied by the host app when using Postgres storage

## Package Install

In a Deno project:

```sh
deno add jsr:@bare-crm/kernel
```

Use the core kernel:

```ts
import { createCrmKernel } from "@bare-crm/kernel"

const crm = createCrmKernel()
```

Use SQLite:

```ts
import { createCrmKernel } from "@bare-crm/kernel"
import { createSqliteStorage } from "@bare-crm/kernel/sqlite"

const storage = createSqliteStorage("./bare-crm.db")
const crm = createCrmKernel({ storage })
```

Use Postgres:

```ts
import { createCrmKernel } from "@bare-crm/kernel"
import { createPostgresStorage } from "@bare-crm/kernel/postgres"

const storage = createPostgresStorage({
  connection: postgresClientOrPool,
  installSchema: true,
})
const crm = createCrmKernel({ storage })
```

Postgres does not force a specific driver. The host app provides a compatible client or pool.

## CLI Install

After the package is published, install the CLI as `crm`:

```sh
deno install -g \
  --allow-read --allow-write --allow-env --allow-ffi \
  -n crm \
  jsr:@bare-crm/kernel/cli
```

Then run:

```sh
crm help
crm doctor
crm db status sqlite ./bare-crm.db
crm db migrate sqlite ./bare-crm.db
crm plugins validate ./plugin.json
```

The CLI permissions are explicit:

- `--allow-read`: read plugin manifests and database files
- `--allow-write`: create or migrate SQLite database files
- `--allow-env`: support the SQLite native dependency
- `--allow-ffi`: load the SQLite native dependency

## Local CLI Install From This Repository

Before publishing, install the local checkout as `crm`:

```sh
deno task install:cli:local
```

Or run without installing:

```sh
deno task crm -- help
deno task crm -- doctor
deno task crm -- db migrate sqlite ./bare-crm.db
```

## Publish Check

Before publishing the package:

```sh
deno fmt
deno task check
deno task test
deno task publish:dry-run
```

Publishing should wait until the public API has been reviewed.

## UI Install

There is no UI install flow yet.

A UI installer would imply product choices that are intentionally outside the kernel right now:

- desktop or hosted app shell
- workspace authentication
- database configuration screens
- plugin management
- migration confirmation screens
- admin dashboard

Those can be built later on top of the package and CLI surfaces.
