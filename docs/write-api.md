# Write API

The Write API is the only official way to change CRM facts.

```ts
await crm.write("person.create", input)
await crm.write("record.update", { workspaceId, ref, patch })
await crm.write("relation.create", { workspaceId, from, to, kind })
await crm.write("record.archive", { workspaceId, ref })
```

## Initial Operations

- `person.create`
- `company.create`
- `deal.create`
- `activity.create`
- `note.create`
- `task.create`
- `file.create`
- `relation.create`
- `record.update`
- `record.archive`

## Lifecycle

```txt
caller
  -> crm.write
  -> validate kernel invariants
  -> check execution context and capabilities when strict mode is enabled
  -> persist through Storage API
  -> append Event Log entry
  -> return committed record
```

Every successful write appends exactly one primary Event Log entry. Failed writes do not append
events.

## Idempotency

Writes may provide an idempotency key.

```ts
await crm.write("person.create", input, {
  idempotencyKey: "csv:contacts:row-42",
})
```

Repeated writes with the same workspace, operation name, and idempotency key return the original
committed result.

## Errors

Kernel errors are structured so UI, MCP, Noros, plugin, and CLI callers can explain or repair them:

```ts
type KernelErrorShape = {
  code: string
  message: string
  field?: string
  retryable?: boolean
  requiredCapability?: Capability
  suggestedFix?: WriteDraft
}
```

Common codes include:

- `record.not_found`
- `record.conflict`
- `workspace.mismatch`
- `context.required`
- `actor.required`
- `permission.denied`

Policy packages may add their own issue codes above the kernel, but kernel writes should remain
machine-readable and safe for adapter/tool responses.

## Non-Goals

- no direct Storage API writes from callers
- no arbitrary ORM-style mutation API
- no UI workflow state in write operations
- no plugin bypass around kernel invariants
