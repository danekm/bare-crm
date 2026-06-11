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

## Default Archive Behavior

Archived records are excluded from default reads. Callers must opt in with `includeArchived`.

## Timeline

The timeline read returns records related to a target record:

- direct record
- relations
- activities with `related` or `participants`
- notes, tasks, and files with `related`
