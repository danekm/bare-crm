# Extension Host

The Extension Host is the official boundary for plugin and workspace customization behavior.

It sits outside the kernel. It can install plugins, register contributions, run plugin lifecycle
hooks, and coordinate optional behavior, but every durable CRM read or write still goes through the
kernel Read API and Write API.

```txt
Plugin
  -> Extension Host
    -> capability gate
    -> Read API / Write API
      -> kernel
        -> Storage API
```

The Extension Host exists so Bare CRM can support serious plugins without turning the kernel into a
plugin runtime.

The first executable skeleton lives in `src/extensions.ts` and is exported from the package as
`@bare-crm/kernel/extensions`.

## Responsibilities

The host owns extension behavior:

- install, uninstall, enable, and disable plugins
- track installed plugin versions per workspace
- validate plugin compatibility
- request and store capability grants
- register schema, relationship-profile, and collection-profile contributions
- register event subscriptions
- run plugin lifecycle and migration hooks
- coordinate sync jobs and sync state
- route secret access through a secrets adapter
- expose commands, policies, workflows, and UI slots to apps that support them

The host does not own kernel invariants. It cannot bypass the Read API, Write API, Event Log, or
Storage API boundaries.

## Kernel Boundary

The kernel owns durable CRM truth:

- record identity, type, workspace, timestamps, and versions
- workspace isolation
- Read API and Write API authorization
- core record validation
- relation endpoint validation
- idempotency
- event append after successful writes
- storage transactions

Plugins, syncs, agents, UIs, and jobs access CRM facts through these kernel APIs.

The host exposes `readAsPlugin` and `writeAsPlugin` as the runtime boundary. Both require the plugin
to be installed, enabled, and approved for the exact CRM capability being used.

## Multi-Tenant State

One Extension Host can serve many workspaces if all extension state is scoped by `workspaceId`.

Workspace-scoped state includes:

- installed plugin state: `workspaceId + pluginId`
- capability grants: `workspaceId + pluginId + capability`
- secrets: `workspaceId + pluginId + key`
- schema contributions: `workspaceId + contributionId`
- event cursors: `workspaceId + pluginId + subscriptionId`
- sync state: `workspaceId + pluginId + syncId`
- migrations: `workspaceId + pluginId + version`

Only package metadata, such as available plugin versions and checksums, should be global.

## Internal Modules

The first implementation can live as one package or module, but it should keep these internal
boundaries clear:

| Module         | Owns                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `runtime`      | plugin lifecycle, enable/disable, hook execution                        |
| `registry`     | installed plugins, package metadata, compatibility                      |
| `capabilities` | requested grants, approved grants, runtime permission checks            |
| `schema`       | custom fields, objects, relationship/collection profiles, display hints |
| `events`       | subscriptions, cursors, retry state, delivery results                   |
| `secrets`      | secret requirements and access through a secret-store adapter           |
| `sync`         | provider cursors, sync runs, locks, conflict metadata                   |

These do not need to be separate packages at first. They are separate boundaries so the host can
grow without being rewritten.

## Relationship Profiles

Bare CRM should not hardcode sales, investor, support, partnership, subscription, or product
assumptions into the kernel.

Instead, plugins can contribute relationship profiles.

Examples:

- `investor`: warm, deferred, committed, passed, next touch date, check size
- `partner`: exploring, integrating, active, paused, integration status
- `customer`: active, at risk, expanding, renewal date, health
- `support`: open, waiting, resolved, severity, escalation owner
- `vendor`: evaluating, active, paused, contract date

Profiles define workspace meaning. The kernel stores the durable records, relations, activities,
tasks, notes, and events.

## Collection Profiles

The kernel owns the generic `Collection` record, but it does not own collection types, statuses, or
outcomes.

Plugins can contribute collection profiles:

```ts
{
  id: "sales.renewal",
  name: "Renewal",
  allowedStatuses: ["open", "waiting", "closed"],
  allowedOutcomes: ["renewed", "churned", "expanded", "no_decision"],
  requiredRelated: ["company"],
  optionalRelated: ["deal", "person", "activity", "note", "task", "file"]
}
```

Other examples:

- `gmail.thread`
- `support.escalation`
- `partner.workstream`
- `account.research`
- `onboarding.case`

Profiles validate workspace meaning above the kernel. The kernel stores `kind`, `status`, `outcome`,
and typed refs as durable CRM facts.

## Event Cursors

Workflow contributions register event subscriptions in the host when `plugin:workflows` is approved.

Cursor state is scoped by:

```txt
workspaceId + pluginId + subscriptionId
```

The host reads committed events through `event.list`, filters by the subscription's `listensTo`
event names, and advances the cursor only when the runtime acknowledges an event.

This gives plugins a small reliable delivery primitive without making the kernel a queue or workflow
runner.

## Secrets

The host exposes a `SecretStore` interface:

```ts
get({ workspaceId, pluginId, key })
set({ workspaceId, pluginId, key, value })
delete ({ workspaceId, pluginId, key })
```

The bundled memory implementation is for tests and local development. Production hosts should
provide an encrypted local store, cloud secret manager, Supabase vault, 1Password, or another
workspace-scoped adapter.

Plugins need approved `secrets:read` capability before reading their own secrets.

## Runtime Safety

Every plugin must pass capability checks. Sandboxing depends on risk:

- manifest-only plugins may need no code sandbox
- trusted local plugins may use a light process or module boundary
- third-party executable plugins need stronger sandboxing
- hosted integrations may be controlled through API credentials and capability grants

The kernel protects CRM data. The Extension Host protects plugin execution.

## Non-Goals

- no plugin execution inside the kernel
- no direct plugin access to the Storage API or database
- no global plugin state that affects every workspace by accident
- no hardcoded business relationship model in the kernel
- no mandatory marketplace
- no requirement that every app support every UI slot or workflow contribution
