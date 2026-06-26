# Dashboard

Bare CRM includes an optional lab dashboard for inspecting and creating records during development.
It is not a stable package surface and should not define the public shape of the kernel.

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

- platform overview for tickets, workflows, dependencies, and QA
- platform lanes backed by `collection` records with stable `platform.*` kinds
- record type rail for people, companies, deals, tasks, notes, activities, and all records
- search box backed by `record.search`
- compact record list
- selected record detail panel
- timeline and relation summaries
- create forms for platform items, person, company, deal, task, note, and activity
- archive action

It is meant to prove the kernel-to-UI loop, not to become a full CRM product. Keep production admin
dashboards and hosted APIs in host-owned packages or applications.

Platform tickets, workflows, dependencies, and QA entries are not special kernel entities. They are
ordinary `collection` records that the dashboard filters by `kind`:

- `platform.ticket`
- `platform.workflow`
- `platform.dependency`
- `platform.qa`

This keeps platform operations visible to the dashboard, MCP tools, plugins, workflows, and import
adapters through the same Read API and Write API.

## Authentication Boundary

Bare CRM does not include admin login, user sessions, password auth, SSO, tenant membership, or
RBAC. Those belong to the host product that embeds the kernel or exposes the dashboard.

The local dashboard constructs its execution context on the server from trusted configuration.
Browser requests do not get to choose actor identity, workspace authority, storage credentials, or
capabilities.

To make this boundary explicit, dashboard requests to `/admin`, `/admin/login`, or `/login` return
`dashboard.auth_not_implemented` with HTTP `501`. A production product should put its own
authentication layer in front of the dashboard or build a separate host-owned admin UI.

## Data Exposure

This is an intentional CRM user surface. It may return names, emails, note previews, statuses, and
other CRM facts to the browser for authorized users.

Browser responses are still screen-specific projections rather than raw storage rows. For example,
the list endpoint returns `title`, `subtitle`, badges, and refs. The detail endpoint returns field,
timeline, and relation sections. The event metadata endpoint strips committed event record snapshots
and does not return raw event `record` payloads.

Production products should also put masking and audit layers in front of this pattern when needed.

## API Shape

The current routes are intentionally boring and local to this dashboard:

```txt
GET  /
GET  /api/workbench/records?type=person&q=ada
GET  /api/workbench/records?type=collection&kind=platform.ticket
GET  /api/workbench/platform
GET  /api/workbench/records/:type/:id
POST /api/workbench/records
POST /api/workbench/records/:type/:id/archive
GET  /api/workbench/events
```

If a hosted product needs a stable public API, add that as a separate adapter contract rather than
letting dashboard routes become the long-term public surface by accident.
