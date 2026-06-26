import { assert, assertEquals } from "jsr:@std/assert"
import { createDashboardHandler } from "../src/dashboard.ts"
import { createCrmKernel } from "../src/kernel.ts"
import { createSqliteMemoryStorage } from "../src/sqlite.ts"

const workspaceId = "workspace_test"

function createHandler() {
  const crm = createCrmKernel({ enforceCapabilities: true })
  return createDashboardHandler({ crm, workspaceId })
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json()
}

Deno.test("dashboard serves the workbench shell", async () => {
  const handler = createHandler()

  const response = await handler(new Request("http://localhost/"))
  const body = await response.text()

  assertEquals(response.status, 200)
  assert(body.includes("Bare CRM Dashboard"))
  assert(body.includes("Platform"))
  assert(body.includes("Tickets"))
  assert(body.includes("/assets/dashboard.js"))
})

Deno.test("dashboard makes host-owned admin auth boundary explicit", async () => {
  const handler = createHandler()

  for (const path of ["/admin", "/admin/login", "/login"]) {
    const response = await handler(new Request(`http://localhost${path}`))
    const body = await json(response)

    assertEquals(response.status, 501)
    assertEquals(body.ok, false)
    assertEquals((body.error as { code: string }).code, "dashboard.auth_not_implemented")
  }
})

Deno.test("dashboard creates and lists projected records through the kernel", async () => {
  const handler = createHandler()

  const createResponse = await handler(
    new Request("http://localhost/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        type: "person",
        data: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          status: "active",
        },
        idempotencyKey: "test:create:ada",
      }),
    }),
  )
  const createBody = await json(createResponse)

  assertEquals(createResponse.status, 201)
  assertEquals(createBody.ok, true)
  assertEquals((createBody.item as { title: string }).title, "Ada Lovelace")

  const listResponse = await handler(
    new Request("http://localhost/api/workbench/records?type=person&q=ada"),
  )
  const listBody = await json(listResponse)
  const items = listBody.items as Array<{ title: string; subtitle: string }>

  assertEquals(listResponse.status, 200)
  assertEquals(items.length, 1)
  assertEquals(items[0].title, "Ada Lovelace")
  assertEquals(items[0].subtitle, "ada@example.com")
})

Deno.test("dashboard detail returns UI projections rather than raw records", async () => {
  const handler = createHandler()

  const createResponse = await handler(
    new Request("http://localhost/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        type: "company",
        data: {
          name: "Acme Inc",
          domain: "acme.example",
          status: "customer",
        },
        idempotencyKey: "test:create:acme",
      }),
    }),
  )
  const createBody = await json(createResponse)
  const ref = (createBody.item as { ref: { type: string; id: string } }).ref

  const detailResponse = await handler(
    new Request(`http://localhost/api/workbench/records/${ref.type}/${ref.id}`),
  )
  const detailBody = await json(detailResponse)
  const detail = detailBody.detail as {
    title: string
    fields: Array<{ label: string; value: string }>
    timeline: unknown[]
    relations: unknown[]
    record?: unknown
  }

  assertEquals(detail.title, "Acme Inc")
  assertEquals(detail.record, undefined)
  assertEquals(detail.fields.some((field) => field.label === "Domain"), true)
  assertEquals(Array.isArray(detail.timeline), true)
  assertEquals(Array.isArray(detail.relations), true)
})

Deno.test("dashboard creates and filters platform collection profiles", async () => {
  const handler = createHandler()

  const createResponse = await handler(
    new Request("http://localhost/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        type: "collection",
        data: {
          title: "Wire CRM into platform dashboard",
          kind: "platform.ticket",
          status: "open",
          summary: "Expose tickets, dependencies, workflows, and QA from the dashboard.",
          tags: "dashboard,qa",
        },
        idempotencyKey: "test:create:platform-ticket",
      }),
    }),
  )
  const createBody = await json(createResponse)

  assertEquals(createResponse.status, 201)
  assertEquals(createBody.ok, true)
  assertEquals(
    (createBody.item as { title: string; subtitle: string }).title,
    "Wire CRM into platform dashboard",
  )
  assertEquals((createBody.item as { subtitle: string }).subtitle, "platform.ticket / open")

  const listResponse = await handler(
    new Request(
      "http://localhost/api/workbench/records?type=collection&kind=platform.ticket&q=platform",
    ),
  )
  const listBody = await json(listResponse)
  const items = listBody.items as Array<{ title: string; badges: string[] }>

  assertEquals(listResponse.status, 200)
  assertEquals(items.length, 1)
  assertEquals(items[0].badges.includes("open"), true)
  assertEquals(items[0].badges.includes("dashboard"), true)
})

Deno.test("dashboard platform overview summarizes tickets workflows dependencies and qa", async () => {
  const handler = createHandler()

  for (
    const [title, kind, status] of [
      ["Ticket one", "platform.ticket", "open"],
      ["Workflow one", "platform.workflow", "active"],
      ["Dependency one", "platform.dependency", "blocked"],
      ["QA one", "platform.qa", "failing"],
    ]
  ) {
    await handler(
      new Request("http://localhost/api/workbench/records", {
        method: "POST",
        body: JSON.stringify({
          type: "collection",
          data: { title, kind, status },
          idempotencyKey: `test:create:${kind}`,
        }),
      }),
    )
  }

  await handler(
    new Request("http://localhost/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        type: "task",
        data: { title: "QA follow-up", status: "doing" },
        idempotencyKey: "test:create:qa-follow-up",
      }),
    }),
  )

  const response = await handler(new Request("http://localhost/api/workbench/platform"))
  const body = await json(response)
  const metrics = body.metrics as Record<string, number>
  const sections = body.sections as Array<{ key: string; items: unknown[] }>

  assertEquals(response.status, 200)
  assertEquals(metrics.openTickets, 1)
  assertEquals(metrics.activeWorkflows, 1)
  assertEquals(metrics.unresolvedDependencies, 1)
  assertEquals(metrics.qaAtRisk, 1)
  assertEquals(metrics.openTasks, 1)
  assertEquals(sections.map((section) => section.key), [
    "tickets",
    "workflows",
    "dependencies",
    "qa",
  ])
  assertEquals(sections.every((section) => section.items.length === 1), true)
})

Deno.test("dashboard detail works with SQLite storage transactions", async () => {
  const storage = createSqliteMemoryStorage()
  try {
    const crm = createCrmKernel({ storage, enforceCapabilities: true })
    const handler = createDashboardHandler({ crm, workspaceId })

    const createResponse = await handler(
      new Request("http://localhost/api/workbench/records", {
        method: "POST",
        body: JSON.stringify({
          type: "person",
          data: {
            name: "SQLite Person",
            email: "sqlite@example.com",
          },
          idempotencyKey: "test:create:sqlite-person",
        }),
      }),
    )
    const createBody = await json(createResponse)
    const ref = (createBody.item as { ref: { type: string; id: string } }).ref

    const detailResponse = await handler(
      new Request(`http://localhost/api/workbench/records/${ref.type}/${ref.id}`),
    )
    const detailBody = await json(detailResponse)

    assertEquals(detailResponse.status, 200)
    assertEquals((detailBody.detail as { title: string }).title, "SQLite Person")
  } finally {
    storage.close()
  }
})

Deno.test("dashboard event metadata strips committed record snapshots", async () => {
  const handler = createHandler()

  await handler(
    new Request("http://localhost/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        type: "person",
        data: {
          name: "Private Person",
          email: "private@example.com",
        },
        idempotencyKey: "test:create:private",
      }),
    }),
  )

  const response = await handler(new Request("http://localhost/api/workbench/events"))
  const body = await response.text()

  assertEquals(response.status, 200)
  assertEquals(body.includes("recordRef"), true)
  assertEquals(body.includes("Private Person"), false)
  assertEquals(body.includes("private@example.com"), false)
  assertEquals(body.includes('"record"'), false)
})

Deno.test("dashboard rejects unsupported creation types", async () => {
  const handler = createHandler()

  const response = await handler(
    new Request("http://localhost/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({ type: "file", data: {} }),
    }),
  )
  const body = await json(response)

  assertEquals(response.status, 400)
  assertEquals(body.ok, false)
  assertEquals((body.error as { code: string }).code, "dashboard.unsupported_type")
})
