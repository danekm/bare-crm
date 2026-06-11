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
  assert(body.includes("/assets/dashboard.js"))
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
