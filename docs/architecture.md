# Architecture

Bare CRM is organized around a small kernel and a set of adapters.

```txt
Apps, agents, MCP clients, CLIs, syncs
  -> adapters
  -> command/query/event kernel
  -> storage adapter
```

## Kernel Responsibilities

The kernel owns only universal invariants:

- records have stable identity, workspace ownership, timestamps, and versions
- references are typed and resolvable
- mutations are expressed as commands
- commands are transactional at the storage boundary
- successful commands emit events
- archived records are excluded from default queries
- policies can block or warn before a mutation
- workflows react after committed events

The kernel should not know whether a sales team requires every deal to have a company. That belongs
in policy.

## Storage

The reference implementation starts in memory. Production storage should be adapter-driven:

- SQLite for local-first and single-tenant installs
- Postgres for hosted/team deployments
- durable event log for replay, audit, and integrations
- full-text search index maintained from committed records and events

## Plugin Surface

Plugins should register capabilities, not mutate internals:

- fields
- policies
- workflows
- commands
- query views
- UI slots
- background jobs
- sync adapters

All plugin writes go back through commands so validation, permissions, events, and audit stay
intact.
