# Hard Rules

These are architecture invariants, not suggestions.

If a proposed feature conflicts with one of these rules, the feature must move outside the kernel,
change shape, or get a deliberate architecture review before implementation.

## Rule Index

| ID       | Rule                                                                                   | Current enforcement                                            |
| -------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `HR-001` | Plugins and integrations never access the Storage API or database directly.            | plugin manifest validation rejects `storage:*`; docs and tests |
| `HR-002` | All durable mutations go through the Write API.                                        | kernel API shape, adapter docs, tests                          |
| `HR-003` | All durable reads go through the Read API.                                             | kernel API shape, adapter docs, tests                          |
| `HR-004` | Event Log records successful writes and is not a workflow runner.                      | kernel implementation and tests                                |
| `HR-005` | The kernel has no UI, embedded model, agent runtime, scheduler, or workflow runner.    | docs and package boundaries                                    |
| `HR-006` | Provider-specific state stays outside kernel entities.                                 | docs, plugin examples, Gmail helper tests                      |
| `HR-007` | Business-specific CRM rules are policies, not kernel invariants.                       | docs and kernel behavior tests                                 |
| `HR-008` | Database schemas are owned by official storage adapters and schema helpers/migrations. | Postgres helper; SQLite helper/migration ledger                |
| `HR-009` | Every first-class storage adapter must pass the shared conformance suite.              | memory, SQLite, and Postgres-compatible tests                  |
| `HR-010` | Optional adapters must be gateways over kernel APIs, not alternate runtimes.           | MCP/plugin/import docs and tests                               |

## HR-001: No Plugin Storage Access

Plugins, channel integrations, MCP servers, CLIs, UIs, agents, Noros, importers, workflows, and jobs
must not read or write the database directly.

They may use:

- Write API
- Read API
- Event Log reads
- plugin-owned state outside the kernel

They may not use:

- Storage API
- SQL tables directly
- SQLite/Postgres client handles
- raw storage credentials
- hidden side-channel writes

Plugin manifests must not request `storage:*` capabilities.

## HR-002: Write API Owns Durable Mutation

Every durable CRM fact change must be expressed as a named Write API operation.

Examples:

- `person.create`
- `company.create`
- `deal.create`
- `collection.create`
- `activity.create`
- `task.create`
- `note.create`
- `file.create`
- `relation.create`
- `record.update`
- `record.archive`

Optional layers may expose their own commands, but those commands must translate into Write API
calls.

## HR-003: Read API Owns Durable Reads

Consumers read CRM facts through the Read API.

Examples:

- `record.get`
- `record.search`
- `timeline.list`
- `relation.list`
- `event.list`

Consumers must not query SQLite/Postgres directly for CRM behavior. Storage adapters can use SQL
internally, but that SQL is not the public read model.

## HR-004: Event Log Is Audit History

The Event Log records successful Write API operations.

It is not:

- a workflow runner
- a scheduler
- a queue
- an event-sourcing replay engine
- business logic execution

Optional workflow packages may read events and call the Write API.

## HR-005: Kernel Has No Runtime Brain

The kernel does not include:

- UI
- embedded model
- agent runtime
- workflow runner
- scheduler
- background job system
- provider sync runtime

Those are optional layers around the kernel.

## HR-006: Provider State Stays Outside Kernel Entities

Provider-specific concepts stay in plugin-owned state or `custom`/`externalRefs` provenance when
they need to be attached to CRM memory.

Examples that must not become kernel entities by default:

- Gmail message/thread/history IDs
- Outlook conversation IDs
- Slack thread timestamps
- support ticket cursors
- webhook delivery attempts
- classifier scores
- ignored sender/domain rules
- OAuth token metadata
- sync cursors

The kernel stores what the source means for the customer relationship: activities, notes, tasks,
files, relations, collections, people, companies, and deals.

## HR-007: Business Rules Are Policies

The kernel enforces universal invariants only.

Kernel invariants:

- record identity
- workspace ownership
- typed entity refs
- relation endpoint existence
- collection related/outcome ref existence
- version advancement
- archive behavior
- event append after successful writes
- transactional storage boundary

Policy rules:

- every deal must have a company
- every company must have a primary contact
- won deal requires `closedAt`
- person must have email before outreach
- high-value deal requires approval
- collection kind/status/outcome must match a workspace profile

Policies can warn or block before a write commits. Policies do not mutate state directly.

## HR-008: Official Database Shape Only

Kernel databases must be created through official storage adapter schema helpers or migrations.

Allowed:

- `installPostgresSchema`
- `getPostgresSchemaSql`
- SQLite schema migrations through official adapter helpers
- future `bare-crm db init` command that calls official helpers

Not allowed:

- plugin-created kernel tables
- hand-written app-specific kernel schema drift
- direct SQL migrations that bypass official schema files
- provider-specific columns in core record tables

Postgres exports schema SQL. SQLite applies official linear migrations and records them in the
`bare_crm_migrations` ledger table.

## HR-009: Storage Adapters Pass Conformance

Every first-class Storage API implementation must pass the shared behavior suite.

Required behavior includes:

- transaction rollback
- optimistic concurrency
- workspace isolation
- type isolation
- event append/list
- idempotency result storage
- archive filtering
- composable search filters

## HR-010: Optional Adapters Are Gateways

MCP, plugins, import/export helpers, future HTTP APIs, CLIs, UIs, workflows, and Noros integrations
are gateways over kernel APIs.

They do not become alternate runtimes. They do not own kernel invariants. They do not monkey-patch
kernel behavior.

## Change Process

Changing a hard rule requires:

1. a written design note explaining why the rule is insufficient
2. updated docs
3. updated conformance tests or enforcement tests
4. explicit review before implementation
