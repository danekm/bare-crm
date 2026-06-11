# Bare CRM

Bare CRM is an experimental CRM kernel: a small, stable Write API, Read API, Event Log, and Storage
API for people, companies, deals, activities, notes, tasks, files, and relationships.

The goal is not to ship a full CRM first. The goal is to make the smallest useful core that other
products, agents, MCP servers, automations, and plugins can build on without depending on a bloated
CRM application.

It is inspired by projects like [Pi](https://github.com/earendil-works/pi): keep the core runtime
simple, make the extension points explicit, and let richer tools accrete around a stable center.

## Principles

- **Kernel over product:** the core stores facts safely; optional layers define behavior.
- **Write API over direct writes:** every mutation goes through a validated write operation.
- **Read API over storage access:** every consumer reads through stable CRM queries.
- **Events over hidden side effects:** every successful mutation emits a durable event.
- **Policies over hardcoded sales assumptions:** teams can enforce their own rules above the kernel.
- **Plugins over schema sprawl:** extensions add fields, workflows, UI slots, syncs, and actions.
- **MCP-native, not MCP-dependent:** agents can use the CRM through MCP, while the kernel remains a
  normal library.
- **No runner in core:** workflows, jobs, UI, and Noros/agents live outside the kernel.

## Core Entities

- `Person`
- `Company`
- `Deal`
- `Activity`
- `Note`
- `Task`
- `File`
- `Relation`

Each entity shares a base record shape: `id`, `workspaceId`, timestamps, `ownerId`, source metadata,
external refs, tags, custom data, and optimistic `version`.

## Runtime Shape

```ts
const crm = createCrmKernel()

await crm.write("person.create", {
  workspaceId: "workspace_1",
  name: "Ada Lovelace",
  emails: [{ value: "ada@example.com", primary: true }],
})

const people = await crm.read("record.search", {
  workspaceId: "workspace_1",
  type: "person",
  text: "ada",
})
```

The first implementation includes the core APIs and an in-memory Storage API implementation. SQLite
and Postgres/Supabase are first-class storage targets next.

## Package Direction

The initial repository starts as one Deno package. As the surface hardens, the likely package split
is:

- `@bare-crm/kernel` for schema, Write API, Read API, Event Log, and Storage API
- `@bare-crm/sqlite` for the SQLite Storage API implementation
- `@bare-crm/postgres` for the Postgres/Supabase Storage API implementation
- `@bare-crm/mcp` for optional model and agent access
- `@bare-crm/plugin-sdk` for optional extensions
- `@bare-crm/workflows` for optional event listeners and job helpers
- `@bare-crm/cli` for optional local operation and development

## Development

This repository uses Deno so the reference kernel can stay dependency-light.

```sh
deno fmt
deno check src/index.ts
deno test
```

## Design Notes

See `docs/` for the first architecture notes:

- [Architecture](docs/architecture.md)
- [Entities](docs/entities.md)
- [Write API](docs/write-api.md)
- [Read API](docs/read-api.md)
- [Event Log](docs/event-log.md)
- [Storage API](docs/storage-api.md)
- [SQLite](docs/sqlite.md)
- [Postgres and Supabase](docs/postgres-supabase.md)
- [Import and export](docs/import-export.md)
- [Channel strategy](docs/channel-strategy.md)
- [Policies and workflows](docs/policies-workflows.md)
- [Plugins](docs/plugins.md)
- [MCP adapter](docs/mcp.md)
- [Noros integration](docs/noros.md)
- [Permissions](docs/permissions.md)
- [Conformance tests](docs/conformance.md)

The Linear project tracks implementation tickets.
