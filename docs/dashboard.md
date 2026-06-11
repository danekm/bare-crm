# Dashboard

Bare CRM includes an optional local dashboard for inspecting and creating records during development
or simple self-hosted use.

The dashboard is not part of the kernel. It is a thin HTTP and browser layer over the Read API and
Write API:

```txt
Browser dashboard
  -> dashboard HTTP handler
    -> crm.read / crm.write
      -> kernel
        -> Storage API
```

It never reads SQLite or Postgres directly.

## Run

```sh
deno task dashboard
```

Or through the CLI:

```sh
deno task crm -- dashboard --db ./bare-crm.db
```

Options:

- `--db <path>`: SQLite database path, default `./bare-crm.db`
- `--workspace <id>`: workspace id, default `workspace_1`
- `--host <host>`: listen host, default `127.0.0.1`
- `--port <port>`: listen port, default `8787`

The direct task also reads:

- `BARE_CRM_DB`
- `BARE_CRM_DASHBOARD_PORT`

## Current UI

The first dashboard is intentionally small:

- record type rail for people, companies, deals, tasks, notes, activities, and all records
- search box backed by `record.search`
- compact record list
- selected record detail panel
- timeline and relation summaries
- create forms for person, company, deal, task, note, and activity
- archive action

It is meant to prove the kernel-to-UI loop, not to become a full CRM product.

## Data Exposure

This is an intentional CRM user surface. It may return names, emails, note previews, statuses, and
other CRM facts to the browser for authorized users.

Browser responses are still screen-specific projections rather than raw storage rows. For example,
the list endpoint returns `title`, `subtitle`, badges, and refs. The detail endpoint returns field,
timeline, and relation sections. The event metadata endpoint strips committed event record snapshots
and does not return raw event `record` payloads.

Production products should put their own authentication, session, tenant, RBAC, masking, and audit
layers in front of this pattern. The dashboard constructs kernel execution context on the server;
the browser does not provide actor identity, workspace authority, storage credentials, or
capabilities.

## API Shape

The current routes are intentionally boring and local to this dashboard:

```txt
GET  /
GET  /api/workbench/records?type=person&q=ada
GET  /api/workbench/records/:type/:id
POST /api/workbench/records
POST /api/workbench/records/:type/:id/archive
GET  /api/workbench/events
```

If a hosted product needs a stable public API, add that as a separate adapter contract rather than
letting dashboard routes become the long-term public surface by accident.
