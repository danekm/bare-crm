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
  -> persist through Storage API
  -> append Event Log entry
  -> return committed record
```

## Idempotency

Writes may provide an idempotency key.

```ts
await crm.write("person.create", input, {
  idempotencyKey: "csv:contacts:row-42",
})
```

Repeated writes with the same workspace, operation name, and idempotency key return the original
committed result.
