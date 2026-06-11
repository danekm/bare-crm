# Bare CRM

Bare CRM is an experimental CRM kernel: a small, stable command/query/event runtime for people,
companies, deals, activities, notes, tasks, files, and relationships.

The goal is not to ship a full CRM first. The goal is to make the smallest useful core that other
products, agents, MCP servers, automations, and plugins can build on without depending on a bloated
CRM application.

It is inspired by projects like [Pi](https://github.com/earendil-works/pi): keep the core runtime
simple, make the extension points explicit, and let richer tools accrete around a stable center.

## Principles

- **Kernel over product:** the core stores facts safely; workflows and plugins define behavior.
- **Commands over direct writes:** every mutation goes through a validated command.
- **Events over hidden side effects:** every successful mutation emits a durable event.
- **Policies over hardcoded sales assumptions:** teams can enforce their own rules above the kernel.
- **Plugins over schema sprawl:** extensions add fields, workflows, UI slots, syncs, and actions.
- **MCP-native, not MCP-dependent:** agents can use the CRM through MCP, while the kernel remains a
  normal library.

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

await crm.command("person.create", {
  workspaceId: "workspace_1",
  name: "Ada Lovelace",
  emails: [{ value: "ada@example.com", primary: true }],
})

const people = await crm.query("record.search", {
  workspaceId: "workspace_1",
  type: "person",
  text: "ada",
})
```

The first implementation is intentionally in-memory. Storage adapters, MCP transport, and plugin
isolation come next.

## Package Direction

The initial repository starts as one Deno package. As the surface hardens, the likely package split
is:

- `@bare-crm/kernel` for commands, queries, events, policies, and workflows
- `@bare-crm/sqlite` for local-first storage
- `@bare-crm/postgres` for hosted/team storage
- `@bare-crm/mcp` for model and agent access
- `@bare-crm/plugin-sdk` for extensions
- `@bare-crm/cli` for local operation and development

## Development

This repository uses Deno so the reference kernel can stay dependency-light.

```sh
deno fmt
deno check src/index.ts
deno test
```

## Roadmap

See `docs/` for the first architecture notes and the Linear project for implementation tickets.
