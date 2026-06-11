# Permissions

Bare CRM has a small execution context model for humans, plugins, agents, syncs, importers, optional
workflows, MCP servers, CLI tools, and future UIs.

The kernel supports two modes:

- **open mode**: default, simple embedding mode; context is optional, but if provided its workspace
  must match the operation input.
- **strict mode**: opt-in with `createCrmKernel({ enforceCapabilities: true })`; every Read API and
  Write API operation requires context, actor, and capability.

## Execution Context

```ts
type ExecutionContext = {
  workspaceId: string
  actor?: {
    type: "human" | "plugin" | "agent" | "sync" | "system"
    id: string
    displayName?: string
  }
  capabilities?: Capability[]
  causationId?: string
  correlationId?: string
}
```

In strict mode, `actor` and `capabilities` are required.

## Capability Names

Capabilities are intentionally boring strings:

```ts
type Capability =
  | "crm:*"
  | "crm:read"
  | "crm:write"
  | `crm:read:${ReadName}`
  | `crm:write:${WriteName}`
```

Examples:

- `crm:*`
- `crm:read`
- `crm:write`
- `crm:read:record.search`
- `crm:read:event.list`
- `crm:write:person.create`
- `crm:write:record.update`

Specific capabilities allow one operation. Broad capabilities allow every read or every write.
`crm:*` allows both.

## Write Example

```ts
const crm = createCrmKernel({ enforceCapabilities: true })

await crm.write(
  "person.create",
  {
    workspaceId: "workspace_1",
    name: "Ada Lovelace",
  },
  {
    context: {
      workspaceId: "workspace_1",
      actor: { type: "agent", id: "agent_1" },
      capabilities: ["crm:write:person.create"],
      correlationId: "gmail_thread_1",
    },
  },
)
```

## Read Example

```ts
await crm.read(
  "event.list",
  {
    workspaceId: "workspace_1",
    correlationId: "gmail_thread_1",
  },
  {
    context: {
      workspaceId: "workspace_1",
      actor: { type: "plugin", id: "gmail_plugin" },
      capabilities: ["crm:read:event.list"],
    },
  },
)
```

## Workspace Isolation

When a context is supplied, `context.workspaceId` must match the operation input workspace.

Adapters should treat context as trusted and user input as untrusted. MCP servers, plugins, and UIs
should create context from authenticated session state rather than accepting actor/workspace
identity from the model or browser request body.

## Actor Attribution

Events store actor/source metadata for audit:

- humans use `actor.type: "human"`
- plugins use `actor.type: "plugin"`
- agents use `actor.type: "agent"`
- syncs/importers use `actor.type: "sync"`
- optional workflow/system writes use `actor.type: "system"`

The kernel does not run workflows. Optional workflow layers should call the Write API with their own
system/plugin actor and causation/correlation IDs.

## Failure Shape

Permission failures use `CrmPermissionError`, which extends `CrmKernelError`.

Useful codes:

- `context.required`
- `actor.required`
- `permission.denied`
- `workspace.mismatch`

The shape is compatible with MCP/tool responses:

```ts
{
  code: "permission.denied",
  message: "Write operation requires capability: crm:write:person.create",
  field: "capabilities",
  retryable: false,
  requiredCapability: "crm:write:person.create"
}
```

## Non-Goals

- no enterprise RBAC matrix in the kernel
- no row-level sharing rules yet
- no secret storage in normal CRM records
- no permission self-declaration by MCP clients or browser requests
