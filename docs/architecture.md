# Architecture

Bare CRM is organized around a very small kernel.

```txt
Bare CRM core kernel
  - core schema
  - Write API
  - Read API
  - Event Log
  - Storage API

Storage API implementations
  - in-memory
  - SQLite
  - Postgres / Supabase

Optional layers outside core
  - policies
  - workflows
  - background jobs
  - plugins
  - MCP
  - CLI / HTTP API
  - UI
  - Noros / agents
```

The kernel has no embedded model, no agent brain, no UI, and no workflow runner.

## Core Responsibilities

The kernel owns only universal invariants:

- records have stable identity, workspace ownership, timestamps, and versions
- references are typed and resolvable
- mutations go through the Write API
- reads go through the Read API
- writes are transactional at the Storage API boundary
- successful writes append events
- archived records are excluded from default reads

The kernel should not know whether a sales team requires every deal to have a company. That belongs
in optional policy code.

## Write API

The Write API is the only official way to change CRM facts.

```ts
await crm.write("person.create", input)
await crm.write("record.update", { workspaceId, ref, patch })
await crm.write("relation.create", { workspaceId, from, to, kind })
await crm.write("record.archive", { workspaceId, ref })
```

A write operation validates kernel invariants, persists through the Storage API, appends one Event
Log entry, and returns the committed record.

## Read API

The Read API is the only official way to read CRM facts without exposing storage internals.

```ts
await crm.read("record.get", { workspaceId, type, id })
await crm.read("record.search", { workspaceId, type, text })
await crm.read("timeline.list", { workspaceId, type, id })
await crm.read("relation.list", { workspaceId, type, id })
await crm.read("event.list", { workspaceId })
```

Plugins, MCP tools, CLIs, future UIs, and agents should use this surface instead of querying SQLite
or Postgres directly.

## Event Log

The Event Log records successful writes. It is durable history and a subscription source for
optional layers.

It is not a workflow runner. It does not execute business logic.

## Storage API

The Storage API is the small persistence contract used by the kernel.

First-class implementations:

- in-memory for tests and examples
- SQLite for local-first, desktop, embedded, and simple self-hosted usage
- Postgres/Supabase for hosted, team, and production usage

The same conformance tests should apply to every Storage API implementation.

## Optional Layers

Optional layers may listen to events and call the Write API/Read API:

- policies enforce business-specific pre-write rules
- workflows react to committed events
- background jobs run imports, syncs, retries, enrichment, and search maintenance
- plugins package fields, policies, workflows, syncs, and UI slots
- MCP exposes safe tools and resources to models and agents
- Noros or other orchestrators can coordinate agentic work

None of these layers are required for the kernel to work.
