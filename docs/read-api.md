# Read API

The Read API is the only official way to read CRM facts without exposing storage internals.

```ts
await crm.read("record.get", { workspaceId, type, id })
await crm.read("record.search", { workspaceId, type, text })
await crm.read("timeline.list", { workspaceId, type, id })
await crm.read("relation.list", { workspaceId, type, id })
await crm.read("event.list", { workspaceId })
```

## Initial Operations

- `record.get`
- `record.search`
- `timeline.list`
- `relation.list`
- `event.list`

Completeness is intentionally not a kernel read operation yet. Optional policy packages and MCP
adapters can expose `list_policy_issues` or a future `completeness.list` composition above the
kernel without changing storage internals.

## Input And Output Shapes

`record.get`:

```ts
await crm.read("record.get", {
  workspaceId: "workspace_1",
  type: "person",
  id: "person_1",
})
// -> AnyRecord | null
```

`record.search`:

```ts
await crm.read("record.search", {
  workspaceId: "workspace_1",
  type: "company",
  text: "acme",
  tags: ["customer"],
  ownerId: "user_1",
  source: "import",
  externalRef: { system: "hubspot", id: "company_1" },
  includeArchived: false,
  limit: 50,
})
// -> AnyRecord[]
```

`timeline.list`:

```ts
await crm.read("timeline.list", {
  workspaceId: "workspace_1",
  type: "deal",
  id: "deal_1",
  includeArchived: false,
  limit: 100,
})
// -> AnyRecord[]
```

`relation.list`:

```ts
await crm.read("relation.list", {
  workspaceId: "workspace_1",
  type: "person",
  id: "person_1",
  includeArchived: false,
  limit: 100,
})
// -> Relation[]
```

`event.list`:

```ts
await crm.read("event.list", {
  workspaceId: "workspace_1",
  name: "person.created",
  actorId: "agent_1",
  correlationId: "gmail_thread_1",
  limit: 100,
})
// -> CrmEvent[]
```

## Default Archive Behavior

Archived records are excluded from default reads. Callers must opt in with `includeArchived`.

`includeArchived` defaults to `false` for record, relation, and timeline reads. Event Log reads keep
history for archived records because events are audit history.

## Pagination And Limits

The first milestone uses `limit` rather than cursor pagination. Storage adapters should return
deterministic bounded results for the same committed state. Cursor pagination can be added later
without exposing storage internals.

## Timeline

The timeline read returns records related to a target record:

- the direct target record when it matches the read
- relation records touching the target
- collections that include the target record
- records included by a target collection's `related` refs
- activities with `related` or `participants`
- notes, tasks, and files with `related`

Events are available through `event.list`. They are not mixed into `timeline.list` yet because the
kernel keeps record reads and audit reads separate.

## Completeness Issues

Completeness means "useful business data may be missing." It is not a kernel invariant.

Recommended shape for optional policy/completeness layers:

```ts
type CompletenessIssue = {
  code: string
  message: string
  severity: "info" | "warn" | "block"
  ref?: EntityRef
  field?: string
  suggestedFix?: {
    name: WriteName
    input: WriteInputByName[WriteName]
  }
}
```

Examples:

- `deal.company_recommended`
- `person.email_missing_before_outreach`
- `task.assignee_recommended`

The kernel allows incomplete data. Optional policy layers may warn, block, or suggest repair writes
above the kernel.
