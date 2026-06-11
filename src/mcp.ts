import { CrmKernelError, CrmPermissionError } from "./kernel.ts"
import type {
  AnyRecord,
  Capability,
  CrmEvent,
  CrmKernel,
  EntityRef,
  EntityType,
  ExecutionContext,
  KernelErrorShape,
  ReadInputByName,
  ReadName,
  ReadOptions,
  ReadResultByName,
  Relation,
  WriteInputByName,
  WriteName,
  WriteOptions,
  WriteResultByName,
} from "./types.ts"

export type McpWriteToolName =
  | "create_person"
  | "create_company"
  | "create_deal"
  | "create_activity"
  | "create_note"
  | "create_task"
  | "update_record"
  | "archive_record"
  | "link_records"

export type McpReadToolName =
  | "search_records"
  | "get_record"
  | "get_timeline"
  | "list_relations"
  | "list_events"
  | "list_policy_issues"

export type McpToolName = McpWriteToolName | McpReadToolName

export type McpToolKind = "write" | "read" | "policy"

export type McpToolDefinition = {
  name: McpToolName
  kind: McpToolKind
  operation?: WriteName | ReadName
  mutates: boolean
  destructive?: boolean
  description: string
  repairHint: string
}

export type McpResourceTemplate = {
  uriTemplate: string
  operation?: ReadName
  description: string
}

export type McpPolicyIssue = {
  code: string
  message: string
  severity: "warn" | "block"
  ref?: EntityRef
  suggestedFix?: KernelErrorShape["suggestedFix"]
}

export type McpToolInputByName = {
  create_person: WriteInputByName["person.create"]
  create_company: WriteInputByName["company.create"]
  create_deal: WriteInputByName["deal.create"]
  create_activity: WriteInputByName["activity.create"]
  create_note: WriteInputByName["note.create"]
  create_task: WriteInputByName["task.create"]
  update_record: WriteInputByName["record.update"]
  archive_record: WriteInputByName["record.archive"]
  link_records: WriteInputByName["relation.create"]
  search_records: ReadInputByName["record.search"]
  get_record: ReadInputByName["record.get"]
  get_timeline: ReadInputByName["timeline.list"]
  list_relations: ReadInputByName["relation.list"]
  list_events: ReadInputByName["event.list"]
  list_policy_issues: { workspaceId: string; ref?: EntityRef }
}

export type McpToolResultByName = {
  create_person: WriteResultByName["person.create"]
  create_company: WriteResultByName["company.create"]
  create_deal: WriteResultByName["deal.create"]
  create_activity: WriteResultByName["activity.create"]
  create_note: WriteResultByName["note.create"]
  create_task: WriteResultByName["task.create"]
  update_record: WriteResultByName["record.update"]
  archive_record: WriteResultByName["record.archive"]
  link_records: WriteResultByName["relation.create"]
  search_records: ReadResultByName["record.search"]
  get_record: ReadResultByName["record.get"]
  get_timeline: ReadResultByName["timeline.list"]
  list_relations: ReadResultByName["relation.list"]
  list_events: ReadResultByName["event.list"]
  list_policy_issues: McpPolicyIssue[]
}

export type McpErrorShape = KernelErrorShape & {
  tool: string
  kind: McpToolKind
  operation?: WriteName | ReadName
  repairHint: string
}

export type McpCallResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: McpErrorShape }

export type McpCallOptions = {
  context?: ExecutionContext
  idempotencyKey?: string
  listPolicyIssues?: (
    input: McpToolInputByName["list_policy_issues"],
    options: { context?: ExecutionContext },
  ) => Promise<McpPolicyIssue[]> | McpPolicyIssue[]
}

export type McpResourceReadResult = {
  uri: string
  contents:
    | AnyRecord
    | AnyRecord[]
    | Relation[]
    | CrmEvent[]
    | BareCrmMcpSchema
    | null
}

export type BareCrmMcpSchema = {
  entityTypes: EntityType[]
  writeOperations: WriteName[]
  readOperations: ReadName[]
  tools: McpToolDefinition[]
}

const writeToolOperations = {
  create_person: "person.create",
  create_company: "company.create",
  create_deal: "deal.create",
  create_activity: "activity.create",
  create_note: "note.create",
  create_task: "task.create",
  update_record: "record.update",
  archive_record: "record.archive",
  link_records: "relation.create",
} as const satisfies Record<McpWriteToolName, WriteName>

const readToolOperations = {
  search_records: "record.search",
  get_record: "record.get",
  get_timeline: "timeline.list",
  list_relations: "relation.list",
  list_events: "event.list",
} as const satisfies Record<Exclude<McpReadToolName, "list_policy_issues">, ReadName>

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "create_person",
    kind: "write",
    operation: "person.create",
    mutates: true,
    description: "Create one person record through the Write API.",
    repairHint: "Provide workspaceId and a non-empty person name.",
  },
  {
    name: "create_company",
    kind: "write",
    operation: "company.create",
    mutates: true,
    description: "Create one company record through the Write API.",
    repairHint: "Provide workspaceId and a non-empty company name.",
  },
  {
    name: "create_deal",
    kind: "write",
    operation: "deal.create",
    mutates: true,
    description: "Create one deal record through the Write API.",
    repairHint: "Provide workspaceId, name, stage, and status.",
  },
  {
    name: "create_activity",
    kind: "write",
    operation: "activity.create",
    mutates: true,
    description: "Create one activity record through the Write API.",
    repairHint: "Provide workspaceId, kind, and occurredAt.",
  },
  {
    name: "create_note",
    kind: "write",
    operation: "note.create",
    mutates: true,
    description: "Create one note record through the Write API.",
    repairHint: "Provide workspaceId, body, and related record refs.",
  },
  {
    name: "create_task",
    kind: "write",
    operation: "task.create",
    mutates: true,
    description: "Create one task record through the Write API.",
    repairHint: "Provide workspaceId, title, and status.",
  },
  {
    name: "update_record",
    kind: "write",
    operation: "record.update",
    mutates: true,
    description: "Patch one existing record through the Write API.",
    repairHint: "Provide workspaceId, a record ref, and only fields that may change.",
  },
  {
    name: "archive_record",
    kind: "write",
    operation: "record.archive",
    mutates: true,
    destructive: true,
    description: "Archive one record through the Write API.",
    repairHint: "Confirm the exact record ref before calling archive_record.",
  },
  {
    name: "link_records",
    kind: "write",
    operation: "relation.create",
    mutates: true,
    description: "Create one relation record through the Write API.",
    repairHint: "Provide workspaceId, from, to, and kind. Both endpoints must exist.",
  },
  {
    name: "search_records",
    kind: "read",
    operation: "record.search",
    mutates: false,
    description: "Search CRM records through the Read API.",
    repairHint: "Provide workspaceId and optional type, text, tags, ownerId, or source filters.",
  },
  {
    name: "get_record",
    kind: "read",
    operation: "record.get",
    mutates: false,
    description: "Get one CRM record through the Read API.",
    repairHint: "Provide workspaceId, type, and id.",
  },
  {
    name: "get_timeline",
    kind: "read",
    operation: "timeline.list",
    mutates: false,
    description: "List records related to a target record through the Read API.",
    repairHint: "Provide workspaceId, type, id, and an optional limit.",
  },
  {
    name: "list_relations",
    kind: "read",
    operation: "relation.list",
    mutates: false,
    description: "List relations touching a target record through the Read API.",
    repairHint: "Provide workspaceId, type, id, and an optional limit.",
  },
  {
    name: "list_events",
    kind: "read",
    operation: "event.list",
    mutates: false,
    description: "List audit events through the Read API.",
    repairHint: "Provide workspaceId and optional event filters.",
  },
  {
    name: "list_policy_issues",
    kind: "policy",
    mutates: false,
    description: "List policy-layer issues supplied by an optional policy package.",
    repairHint: "Attach a policy issue provider or treat an empty result as no policy issues.",
  },
]

export const MCP_RESOURCE_TEMPLATES: McpResourceTemplate[] = [
  {
    uriTemplate: "crm://record/{type}/{id}",
    operation: "record.get",
    description: "Read one record by type and id.",
  },
  {
    uriTemplate: "crm://timeline/{type}/{id}",
    operation: "timeline.list",
    description: "Read the timeline related to one record.",
  },
  {
    uriTemplate: "crm://search?q={query}",
    operation: "record.search",
    description: "Search records using the context workspace.",
  },
  {
    uriTemplate: "crm://workspace/{workspaceId}/schema",
    description: "Return the adapter schema without touching storage.",
  },
  {
    uriTemplate: "crm://workspace/{workspaceId}/events",
    operation: "event.list",
    description: "Read workspace events through the Read API.",
  },
]

export function createMcpExecutionContext(input: {
  workspaceId: string
  actorId: string
  displayName?: string
  capabilities?: Capability[]
  causationId?: string
  correlationId?: string
}): ExecutionContext {
  return {
    workspaceId: input.workspaceId,
    actor: {
      type: "agent",
      id: input.actorId,
      displayName: input.displayName,
    },
    capabilities: input.capabilities,
    causationId: input.causationId,
    correlationId: input.correlationId,
  }
}

export async function callMcpTool<N extends McpToolName>(
  crm: CrmKernel,
  name: N,
  input: McpToolInputByName[N],
  options: McpCallOptions = {},
): Promise<McpCallResult<McpToolResultByName[N]>> {
  const definition = getToolDefinition(name)

  try {
    if (isWriteTool(name)) {
      const operation = writeToolOperations[name]
      const result = await crm.write(
        operation,
        input as never,
        writeOptions(options),
      )
      return { ok: true, result: result as McpToolResultByName[N] }
    }

    if (isKernelReadTool(name)) {
      const operation = readToolOperations[name]
      const result = await crm.read(
        operation,
        input as never,
        readOptions(options),
      )
      return { ok: true, result: result as McpToolResultByName[N] }
    }

    const result = options.listPolicyIssues
      ? await options.listPolicyIssues(
        input as McpToolInputByName["list_policy_issues"],
        { context: options.context },
      )
      : []
    return { ok: true, result: result as McpToolResultByName[N] }
  } catch (error) {
    return {
      ok: false,
      error: toMcpError(error, definition),
    }
  }
}

export async function readMcpResource(
  crm: CrmKernel,
  uri: string,
  options: { context: ExecutionContext },
): Promise<McpCallResult<McpResourceReadResult>> {
  try {
    const request = parseMcpResourceUri(uri, options.context.workspaceId)

    switch (request.kind) {
      case "record": {
        const result = await crm.read("record.get", request.input, readOptions(options))
        return { ok: true, result: { uri, contents: result } }
      }
      case "timeline": {
        const result = await crm.read("timeline.list", request.input, readOptions(options))
        return { ok: true, result: { uri, contents: result } }
      }
      case "search": {
        const result = await crm.read("record.search", request.input, readOptions(options))
        return { ok: true, result: { uri, contents: result } }
      }
      case "schema":
        return { ok: true, result: { uri, contents: createMcpSchema() } }
      case "events": {
        const result = await crm.read("event.list", request.input, readOptions(options))
        return { ok: true, result: { uri, contents: result } }
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: toMcpError(error, {
        name: "get_record",
        kind: "read",
        mutates: false,
        repairHint: "Use a supported crm:// resource URI with the authenticated workspace.",
        description: "Read an MCP resource.",
      }),
    }
  }
}

export function createMcpSchema(): BareCrmMcpSchema {
  return {
    entityTypes: ["person", "company", "deal", "activity", "note", "task", "file", "relation"],
    writeOperations: [
      "person.create",
      "company.create",
      "deal.create",
      "activity.create",
      "note.create",
      "task.create",
      "file.create",
      "relation.create",
      "record.update",
      "record.archive",
    ],
    readOperations: ["record.get", "record.search", "timeline.list", "relation.list", "event.list"],
    tools: MCP_TOOL_DEFINITIONS,
  }
}

function writeOptions(options: McpCallOptions): WriteOptions | undefined {
  if (!options.context && !options.idempotencyKey) return undefined
  return {
    context: options.context,
    idempotencyKey: options.idempotencyKey,
  }
}

function readOptions(options: Pick<McpCallOptions, "context">): ReadOptions | undefined {
  if (!options.context) return undefined
  return { context: options.context }
}

function getToolDefinition(name: McpToolName): McpToolDefinition {
  const definition = MCP_TOOL_DEFINITIONS.find((tool) => tool.name === name)
  if (!definition) {
    throw new Error(`Unknown MCP tool: ${name}`)
  }
  return definition
}

function isWriteTool(name: McpToolName): name is McpWriteToolName {
  return name in writeToolOperations
}

function isKernelReadTool(
  name: McpToolName,
): name is Exclude<McpReadToolName, "list_policy_issues"> {
  return name in readToolOperations
}

function toMcpError(error: unknown, definition: McpToolDefinition): McpErrorShape {
  if (error instanceof CrmPermissionError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      retryable: error.retryable,
      requiredCapability: error.requiredCapability,
      tool: definition.name,
      kind: definition.kind,
      operation: definition.operation,
      repairHint: definition.repairHint,
    }
  }

  if (error instanceof CrmKernelError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      retryable: error.retryable,
      tool: definition.name,
      kind: definition.kind,
      operation: definition.operation,
      repairHint: definition.repairHint,
    }
  }

  return {
    code: "mcp.adapter_error",
    message: error instanceof Error ? error.message : "Unknown MCP adapter error",
    retryable: false,
    tool: definition.name,
    kind: definition.kind,
    operation: definition.operation,
    repairHint: definition.repairHint,
  }
}

type ParsedMcpResource =
  | { kind: "record"; input: ReadInputByName["record.get"] }
  | { kind: "timeline"; input: ReadInputByName["timeline.list"] }
  | { kind: "search"; input: ReadInputByName["record.search"] }
  | { kind: "schema"; workspaceId: string }
  | { kind: "events"; input: ReadInputByName["event.list"] }

function parseMcpResourceUri(uri: string, contextWorkspaceId: string): ParsedMcpResource {
  const parsed = new URL(uri)
  if (parsed.protocol !== "crm:") {
    throw new Error("MCP resource URI must use crm://")
  }

  switch (parsed.hostname) {
    case "record": {
      const [type, id] = splitPath(parsed.pathname)
      return {
        kind: "record",
        input: { workspaceId: contextWorkspaceId, type: parseEntityType(type), id },
      }
    }
    case "timeline": {
      const [type, id] = splitPath(parsed.pathname)
      return {
        kind: "timeline",
        input: {
          workspaceId: contextWorkspaceId,
          type: parseEntityType(type),
          id,
          limit: parseLimit(parsed),
        },
      }
    }
    case "search":
      return {
        kind: "search",
        input: {
          workspaceId: contextWorkspaceId,
          text: parsed.searchParams.get("q") ?? undefined,
          type: parseOptionalEntityType(parsed.searchParams.get("type")),
          limit: parseLimit(parsed),
        },
      }
    case "workspace": {
      const [workspaceId, resource] = splitPath(parsed.pathname)
      assertWorkspace(workspaceId, contextWorkspaceId)
      if (resource === "schema") return { kind: "schema", workspaceId }
      if (resource === "events") {
        return {
          kind: "events",
          input: { workspaceId, limit: parseLimit(parsed) },
        }
      }
      throw new Error(`Unsupported workspace MCP resource: ${resource}`)
    }
    default:
      throw new Error(`Unsupported MCP resource host: ${parsed.hostname}`)
  }
}

function splitPath(pathname: string): [string, string] {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent)
  if (parts.length !== 2) {
    throw new Error("MCP resource URI must contain exactly two path segments")
  }
  return [parts[0], parts[1]]
}

function parseLimit(parsed: URL): number | undefined {
  const value = parsed.searchParams.get("limit")
  if (value === null) return undefined
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("MCP resource limit must be a positive integer")
  }
  return limit
}

function parseOptionalEntityType(value: string | null): EntityType | undefined {
  if (value === null) return undefined
  return parseEntityType(value)
}

function parseEntityType(value: string): EntityType {
  if (
    value === "person" ||
    value === "company" ||
    value === "deal" ||
    value === "activity" ||
    value === "note" ||
    value === "task" ||
    value === "file" ||
    value === "relation"
  ) {
    return value
  }
  throw new Error(`Unsupported CRM entity type: ${value}`)
}

function assertWorkspace(workspaceId: string, contextWorkspaceId: string): void {
  if (workspaceId !== contextWorkspaceId) {
    throw new Error("MCP resource workspace must match execution context")
  }
}
