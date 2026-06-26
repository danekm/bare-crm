# Read API

The Read API is the official way to read CRM facts without exposing storage internals. It stays
small on purpose: kernel reads return durable CRM records, relations, and events.

```ts
await crm.read("record.get", { workspaceId, type, id })
await crm.read("record.search", { workspaceId, type, text, limit })
await crm.read("timeline.list", { workspaceId, type, id, limit })
await crm.read("relation.list", { workspaceId, type, id, limit })
await crm.read("event.list", { workspaceId, limit })
```

## Kernel Operations

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

## Compact Reads

Agent-facing and CLI-facing code can use the optional compact read helper. This helper is exported
separately from the kernel so token budgets, cursors, field projection, and summaries can evolve
without changing the durable CRM contract.

Compact reads are deterministic projections for adapter boundaries. They do not modify stored CRM
data, infer record importance, rank items by salience, or replace canonical Read API results.

```ts
import { readCompact } from "@bare-crm/kernel/compact-read"

const page = await readCompact(
  crm,
  {
    operation: "record.search",
    input: {
      workspaceId: "workspace_1",
      type: "person",
      text: "ada",
    },
  },
  {
    fields: ["id", "type", "name", "emails"],
    limit: 10,
    tokenBudget: 1200,
  },
)
// -> {
//   items: Array<Record<string, unknown>>,
//   nextCursor?: string,
//   pageInfo: {
//     limit: number,
//     returned: number,
//     hasMore: boolean,
//     mode: "full" | "summary" | "fields",
//     estimatedTokens: number,
//     tokenBudget?: number
//   }
// }
```

Supported compact operations:

- `record.search`
- `timeline.list`
- `event.list`

Compact read options:

- `fields`: return only selected top-level fields
- `summary`: return compact CRM summaries instead of full records or events
- `limit`: cap the maximum item count
- `cursor`: continue from a previous compact page
- `tokenBudget`: cap the approximate response size
- `readOptions`: pass kernel read options such as execution context

The cursor input is named `cursor`; the response token is named `nextCursor`. `pageInfo.hasMore`
mirrors whether another compact page is available.

`cursor` is an opaque pagination pointer, not a workflow resume token. Callers should store it only
long enough to continue reading the same compact operation, and they should not parse or construct
it themselves.

Token estimates are intentionally approximate. The helper estimates response tokens from serialized
JSON size and stops adding items when the next item would exceed `tokenBudget`. If the first item is
larger than the budget, the page may include that single item so callers can still make progress.

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
