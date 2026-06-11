# Policies And Workflows

Policies and workflows are the layer above the kernel.

## Policies

Policies answer: should this command be allowed to proceed?

They run before a write and cannot mutate data.

```ts
crm.policy({
  id: "deal-company-required",
  appliesTo: ["deal.create", "deal.update"],
  mode: "blocking",
  evaluate({ input }) {
    if (!input.companyId) {
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

## Workflows

Workflows answer: now that something happened, what should happen next?

They run after committed events and can mutate data only by calling commands.

```ts
crm.workflow({
  id: "meeting-follow-up",
  trigger: "activity.created",
  async run({ event, crm }) {
    if (event.record.kind !== "meeting") return

    await crm.command("task.create", {
      workspaceId: event.record.workspaceId,
      title: "Send follow-up",
      related: event.record.related,
    })
  },
})
```

## Runtime Rules

- policies cannot write data
- workflows write only through commands
- policy and workflow runs are observable
- workflow retries are idempotent
- permissions still apply inside plugins and workflows
- loop guards prevent infinite event chains
- human approval can pause a workflow
