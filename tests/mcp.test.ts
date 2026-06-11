import { assert, assertEquals } from "jsr:@std/assert"
import {
  callMcpTool,
  createCrmKernel,
  createMcpExecutionContext,
  createMcpSchema,
  MCP_RESOURCE_TEMPLATES,
  MCP_TOOL_DEFINITIONS,
  readMcpResource,
} from "../src/index.ts"

Deno.test("MCP tool registry maps tools to Read API and Write API operations", () => {
  assertEquals(
    MCP_TOOL_DEFINITIONS.map((tool) => [tool.name, tool.kind, tool.operation, tool.mutates]),
    [
      ["create_person", "write", "person.create", true],
      ["create_company", "write", "company.create", true],
      ["create_deal", "write", "deal.create", true],
      ["create_activity", "write", "activity.create", true],
      ["create_note", "write", "note.create", true],
      ["create_task", "write", "task.create", true],
      ["update_record", "write", "record.update", true],
      ["archive_record", "write", "record.archive", true],
      ["link_records", "write", "relation.create", true],
      ["search_records", "read", "record.search", false],
      ["get_record", "read", "record.get", false],
      ["get_timeline", "read", "timeline.list", false],
      ["list_relations", "read", "relation.list", false],
      ["list_events", "read", "event.list", false],
      ["list_policy_issues", "policy", undefined, false],
    ],
  )
  assertEquals(
    MCP_RESOURCE_TEMPLATES.map((resource) => [resource.uriTemplate, resource.operation]),
    [
      ["crm://record/{type}/{id}", "record.get"],
      ["crm://timeline/{type}/{id}", "timeline.list"],
      ["crm://search?q={query}", "record.search"],
      ["crm://workspace/{workspaceId}/schema", undefined],
      ["crm://workspace/{workspaceId}/events", "event.list"],
    ],
  )
})

Deno.test("MCP write tools call the Write API with adapter context", async () => {
  const crm = createCrmKernel({
    enforceCapabilities: true,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: sequenceId(),
  })
  const context = createMcpExecutionContext({
    workspaceId: "workspace_1",
    actorId: "agent_1",
    capabilities: ["crm:write:person.create", "crm:read:event.list"],
    correlationId: "thread_1",
  })

  const result = await callMcpTool(
    crm,
    "create_person",
    {
      workspaceId: "workspace_1",
      name: "Ada Lovelace",
      source: "agent",
    },
    { context, idempotencyKey: "agent:create-person:1" },
  )

  assert(result.ok)
  assertEquals(result.result.id, "id_2")

  const events = await crm.read("event.list", { workspaceId: "workspace_1" }, { context })
  assertEquals(events[0].operation, "person.create")
  assertEquals(events[0].actorType, "agent")
  assertEquals(events[0].actorId, "agent_1")
  assertEquals(events[0].correlationId, "thread_1")
  assertEquals(events[0].idempotencyKey, "agent:create-person:1")
})

Deno.test("MCP read tools call the Read API with adapter context", async () => {
  const crm = createCrmKernel({
    enforceCapabilities: true,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: sequenceId(),
  })
  const writer = createMcpExecutionContext({
    workspaceId: "workspace_1",
    actorId: "agent_1",
    capabilities: ["crm:write:company.create"],
  })
  const reader = createMcpExecutionContext({
    workspaceId: "workspace_1",
    actorId: "agent_1",
    capabilities: ["crm:read:record.search"],
  })

  await callMcpTool(
    crm,
    "create_company",
    { workspaceId: "workspace_1", name: "Analytical Engines Ltd" },
    { context: writer },
  )
  const result = await callMcpTool(
    crm,
    "search_records",
    { workspaceId: "workspace_1", type: "company", text: "engines" },
    { context: reader },
  )

  assert(result.ok)
  assertEquals(result.result.map((record) => record.type), ["company"])
})

Deno.test("MCP permission failures are structured for repair loops", async () => {
  const crm = createCrmKernel({ enforceCapabilities: true })
  const result = await callMcpTool(
    crm,
    "create_task",
    { workspaceId: "workspace_1", title: "Follow up", status: "todo" },
    {
      context: createMcpExecutionContext({
        workspaceId: "workspace_1",
        actorId: "agent_1",
        capabilities: ["crm:read"],
      }),
    },
  )

  assertEquals(result.ok, false)
  if (result.ok) throw new Error("Expected permission failure")
  assertEquals(result.error.code, "permission.denied")
  assertEquals(result.error.tool, "create_task")
  assertEquals(result.error.kind, "write")
  assertEquals(result.error.operation, "task.create")
  assertEquals(result.error.requiredCapability, "crm:write:task.create")
  assertEquals(result.error.repairHint, "Provide workspaceId, title, and status.")
})

Deno.test("MCP policy issues are supplied by an optional policy layer", async () => {
  const crm = createCrmKernel()
  const result = await callMcpTool(
    crm,
    "list_policy_issues",
    { workspaceId: "workspace_1", ref: { type: "deal", id: "deal_1" } },
    {
      listPolicyIssues: (input) => [{
        code: "deal.company_recommended",
        message: `Deal ${input.ref?.id} should be linked to a company before close.`,
        severity: "warn",
        ref: input.ref,
      }],
    },
  )

  assert(result.ok)
  assertEquals(result.result, [{
    code: "deal.company_recommended",
    message: "Deal deal_1 should be linked to a company before close.",
    severity: "warn",
    ref: { type: "deal", id: "deal_1" },
  }])
})

Deno.test("MCP resources read through Read API resources or static schema", async () => {
  const crm = createCrmKernel({
    enforceCapabilities: true,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: sequenceId(),
  })
  const context = createMcpExecutionContext({
    workspaceId: "workspace_1",
    actorId: "agent_1",
    capabilities: ["crm:write:person.create", "crm:read:record.get", "crm:read:event.list"],
  })
  const created = await callMcpTool(
    crm,
    "create_person",
    { workspaceId: "workspace_1", name: "Ada Lovelace" },
    { context },
  )
  assert(created.ok)

  const record = await readMcpResource(crm, "crm://record/person/id_2", { context })
  assert(record.ok)
  assertEquals(record.result.contents, created.result)

  const schema = await readMcpResource(crm, "crm://workspace/workspace_1/schema", { context })
  assert(schema.ok)
  assertEquals(schema.result.contents, createMcpSchema())

  const events = await readMcpResource(crm, "crm://workspace/workspace_1/events?limit=1", {
    context,
  })
  assert(events.ok)
  if (!Array.isArray(events.result.contents)) throw new Error("Expected event array")
  assertEquals(events.result.contents.length, 1)
})

Deno.test("MCP resources reject workspace mismatch before kernel reads", async () => {
  const crm = createCrmKernel()
  const result = await readMcpResource(crm, "crm://workspace/workspace_2/events", {
    context: createMcpExecutionContext({
      workspaceId: "workspace_1",
      actorId: "agent_1",
      capabilities: ["crm:read:event.list"],
    }),
  })

  assertEquals(result.ok, false)
  if (result.ok) throw new Error("Expected resource failure")
  assertEquals(result.error.code, "mcp.adapter_error")
  assertEquals(
    result.error.repairHint,
    "Use a supported crm:// resource URI with the authenticated workspace.",
  )
})

function sequenceId(): () => string {
  let next = 1
  return () => `id_${next++}`
}
