# Permissions

Every Write API and Read API call should eventually receive an execution context.

```ts
type ExecutionContext = {
  workspaceId: string
  actor?: {
    type: "human" | "plugin" | "agent" | "sync" | "system"
    id: string
    displayName?: string
  }
  capabilities?: string[]
  causationId?: string
  correlationId?: string
}
```

## Rules

- workspace identity comes from trusted context in adapters
- plugins and MCP clients receive only granted capabilities
- Event Log entries preserve actor/source metadata
- Read API results may be filtered or redacted by capability

The first kernel implementation checks workspace mismatch when context is provided. Full capability
enforcement belongs in the next permission pass.
