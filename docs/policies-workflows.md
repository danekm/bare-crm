# Policies And Workflows

Policies and workflows are optional layers above the kernel.

The core kernel has no policy registry and no workflow runner. It exposes the Write API, Read API,
Event Log, and Storage API. Optional packages may use those primitives to add business behavior.

## Policies

Policies answer: should this Write API operation be allowed to proceed?

They run before a write and cannot mutate data directly.

```ts
policy({
  id: "deal-company-required",
  appliesTo: ["deal.create", "record.update"],
  mode: "blocking",
  evaluate({ input }) {
    if (!("companyId" in input)) {
      return {
        ok: false,
        code: "deal.company_required",
        message: "Deals in this workspace require a company.",
        field: "companyId",
      }
    }

    return { ok: true }
  },
})
```

Policies are not kernel invariants. They are workspace/plugin behavior.

## Workflows

Workflows answer: now that something happened, what should happen next?

They run after committed events and mutate data only through the Write API.

```ts
workflow({
  id: "meeting-follow-up",
  trigger: "activity.created",
  async run({ event, crm }) {
    if (event.record.type !== "activity" || event.record.kind !== "meeting") return

    await crm.write("task.create", {
      workspaceId: event.record.workspaceId,
      title: "Send follow-up",
      status: "todo",
      related: [{ type: "activity", id: event.record.id }],
    })
  },
})
```

A workflow does not require a model. Most workflows should be deterministic event handlers.

## Background Jobs

Background jobs are optional async tasks outside the core:

- importing a CSV
- syncing from another CRM
- retrying webhook delivery
- recomputing a search index
- running enrichment
- creating reminders

Jobs use the Write API and Read API. They do not bypass the kernel.

## Runtime Rules

- policies cannot write data
- workflows and jobs write only through the Write API
- workflows and jobs read only through the Read API
- optional runs should be observable
- retries should be idempotent
- permissions still apply inside plugins and workflows
- loop guards should prevent infinite event chains
- human approval can pause an optional workflow
