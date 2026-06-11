# Event Log

The Event Log records successful Write API operations.

It is durable history. It is not a workflow runner.

## Event Shape

```ts
type CrmEvent = {
  id: string
  workspaceId: string
  name: "person.created" | "company.updated" | string
  record: AnyRecord
  occurredAt: string
  writeId: string
  actorId?: string
  causationId?: string
  correlationId?: string
  idempotencyKey?: string
}
```

Optional workflows, jobs, MCP servers, and agents may read events and react outside the core.
