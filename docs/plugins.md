# Plugins

Plugins are optional packages outside the core kernel.

They can contribute:

- fields
- policies
- workflows
- sync adapters
- UI slots
- extra write operations

Plugins use the Write API and Read API. They never write directly to the Storage API.

## Manifest Sketch

```json
{
  "id": "example.follow-ups",
  "name": "Follow-up reminders",
  "version": "0.1.0",
  "capabilities": ["records:read", "tasks:write", "workflows:register"],
  "contributes": {
    "fields": [],
    "policies": [],
    "workflows": [],
    "commands": [],
    "uiSlots": []
  }
}
```

## Boundary Rule

Plugins may extend behavior, but they do not own kernel invariants.
