# Bare CRM

Bare CRM is an experimental CRM kernel: a small, stable Write API, Read API, Event Log, and Storage
API for people, companies, deals, activities, notes, tasks, files, and relationships.

The goal is not to ship a full CRM first. The goal is to make the smallest useful core that other
products, agents, MCP servers, automations, and plugins can build on without depending on a bloated
CRM application.

It is inspired by projects like [Pi](https://github.com/earendil-works/pi): keep the core runtime
simple, make the extension points explicit, and let richer tools accrete around a stable center.

## Status

Bare CRM is early and experimental. The public API should be treated as reviewable, not stable,
until the core contracts settle.

This repository is intentionally not a production CRM app, hosted SaaS, admin UI, workflow platform,
or agent runtime.

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

## How It Differs

Bare CRM is closest in spirit to a small runtime kernel. It is not trying to replace a full CRM
product by adding every feature. It is trying to make CRM facts portable, durable, and easy to
extend.

| Project type              | Useful when you want                          | Bare CRM difference                                                                          |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Twenty, EspoCRM, SuiteCRM | a ready CRM app with UI and product workflows | Bare CRM has no required UI and no baked-in sales process                                    |
| Corteza                   | a larger low-code business app platform       | Bare CRM keeps the core to CRM records, APIs, storage, and events                            |
| Directus                  | a data/API platform over a database           | Bare CRM exposes CRM-specific Write API and Read API contracts, not arbitrary storage access |
| Custom agent memory       | model-native memory for one agent flow        | Bare CRM stores durable business facts with audit history and storage adapters               |

The bet is that a very small stable kernel can support many different products, plugins, agents, and
interfaces without becoming a swollen CRM application itself.

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

The first implementation includes the core APIs plus in-memory, SQLite, and Postgres/Supabase
Storage API implementations.

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

## Open Source Posture

Bare CRM is MIT licensed. Contributions should protect the small core:

- add kernel behavior only when it is universal CRM infrastructure
- put sales-process opinions in policies, workflows, plugins, or examples
- keep storage adapters behind the Storage API
- keep model, UI, MCP server, and Noros assumptions outside the kernel
- add or extend tests when changing behavior

See [CONTRIBUTING.md](CONTRIBUTING.md) and [Open source plan](docs/open-source.md).

## Development

This repository uses Deno so the reference kernel can stay dependency-light.

```sh
deno fmt
deno task check
deno task test
```

`deno task test` grants the explicit permissions required by the SQLite native dependency and keeps
network access scoped to the GitHub release hosts used for that dependency.

## Design Notes

See `docs/` for the first architecture notes:

- [Hard rules](docs/hard-rules.md)
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
- [Bare Gmail plugin](docs/gmail-plugin.md)
- [Policies and workflows](docs/policies-workflows.md)
- [Plugins](docs/plugins.md)
- [MCP adapter](docs/mcp.md)
- [Noros integration](docs/noros.md)
- [Open source plan](docs/open-source.md)
- [Permissions](docs/permissions.md)
- [Conformance tests](docs/conformance.md)

The Linear project tracks implementation tickets.
