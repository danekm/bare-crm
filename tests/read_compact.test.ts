import { assertEquals, assertInstanceOf, assertRejects } from "jsr:@std/assert"
import { createCrmKernel, createMemoryStorage, type StorageApi } from "../src/index.ts"
import { CompactReadError, readCompact } from "../src/adapters/compact-read/mod.ts"
import { createSqliteMemoryStorage } from "../src/sqlite.ts"
import { createFakePostgresStorage } from "./fake_postgres.ts"

type CloseableStorage = StorageApi & { close?: () => void }

const compactReadScenarios: Array<{ name: string; createStorage: () => CloseableStorage }> = [
  { name: "memory", createStorage: createMemoryStorage },
  { name: "SQLite", createStorage: createSqliteMemoryStorage },
  { name: "Postgres", createStorage: createFakePostgresStorage },
]

for (const scenario of compactReadScenarios) {
  Deno.test(`${scenario.name}: compact record reads support fields and cursors`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_a",
        name: "Ada Lovelace",
        emails: [{ value: "ada@example.com", primary: true }],
      })
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_b",
        name: "Grace Hopper",
        emails: [{ value: "grace@example.com", primary: true }],
      })
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_c",
        name: "Katherine Johnson",
        emails: [{ value: "katherine@example.com", primary: true }],
      })

      const firstPage = await readCompact(
        crm,
        {
          operation: "record.search",
          input: { workspaceId: "workspace_1", type: "person" },
        },
        {
          limit: 2,
          fields: ["id", "type", "name"],
          tokenBudget: 200,
        },
      )

      assertEquals(firstPage.items, [
        { id: "person_a", type: "person", name: "Ada Lovelace" },
        { id: "person_b", type: "person", name: "Grace Hopper" },
      ])
      assertEquals(firstPage.pageInfo.mode, "fields")
      assertEquals(firstPage.pageInfo.returned, 2)
      assertEquals(firstPage.pageInfo.hasMore, true)
      assertEquals(typeof firstPage.nextCursor, "string")

      const secondPage = await readCompact(
        crm,
        {
          operation: "record.search",
          input: { workspaceId: "workspace_1", type: "person" },
        },
        {
          cursor: firstPage.nextCursor,
          limit: 2,
          fields: ["id", "type", "name"],
          tokenBudget: 200,
        },
      )

      assertEquals(secondPage.items, [
        { id: "person_c", type: "person", name: "Katherine Johnson" },
      ])
      assertEquals(secondPage.pageInfo.hasMore, false)
      assertEquals(secondPage.nextCursor, undefined)
    })
  })

  Deno.test(`${scenario.name}: compact event reads support summaries and cursors`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_a",
        name: "Ada Lovelace",
      })
      await crm.write("company.create", {
        workspaceId: "workspace_1",
        id: "company_a",
        name: "Analytical Engines Ltd",
      })

      const firstPage = await readCompact(
        crm,
        {
          operation: "event.list",
          input: { workspaceId: "workspace_1" },
        },
        {
          limit: 1,
          summary: true,
          tokenBudget: 120,
        },
      )

      assertEquals(firstPage.items.length, 1)
      assertEquals(firstPage.items[0].name, "person.created")
      assertEquals(firstPage.items[0].recordRef, { type: "person", id: "person_a" })
      assertEquals("record" in firstPage.items[0], false)
      assertEquals(firstPage.pageInfo.mode, "summary")
      assertEquals(firstPage.pageInfo.hasMore, true)
      assertEquals(typeof firstPage.nextCursor, "string")

      const secondPage = await readCompact(
        crm,
        {
          operation: "event.list",
          input: { workspaceId: "workspace_1" },
        },
        {
          cursor: firstPage.nextCursor,
          limit: 1,
          summary: true,
          tokenBudget: 120,
        },
      )

      assertEquals(secondPage.items.length, 1)
      assertEquals(secondPage.items[0].name, "company.created")
      assertEquals(secondPage.pageInfo.hasMore, false)
      assertEquals(secondPage.nextCursor, undefined)
    })
  })

  Deno.test(`${scenario.name}: compact cursors are scoped to the operation`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_a",
        name: "Ada Lovelace",
      })
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_b",
        name: "Grace Hopper",
      })

      const page = await readCompact(
        crm,
        {
          operation: "record.search",
          input: { workspaceId: "workspace_1", type: "person" },
        },
        { limit: 1, fields: ["id"] },
      )

      const error = await assertRejects(
        () =>
          readCompact(
            crm,
            {
              operation: "event.list",
              input: { workspaceId: "workspace_1" },
            },
            { cursor: page.nextCursor },
          ),
        CompactReadError,
      )
      assertInstanceOf(error, CompactReadError)
      assertEquals(error.code, "compact_read.cursor_invalid")
      assertEquals(error.field, "cursor")
    })
  })
}

async function withKernel(
  scenario: { createStorage: () => CloseableStorage },
  run: (crm: ReturnType<typeof createCrmKernel>) => Promise<void>,
): Promise<void> {
  const storage = scenario.createStorage()
  try {
    const crm = createCrmKernel({
      storage,
      now: fixedNow,
      id: createDeterministicId(),
    })
    await run(crm)
  } finally {
    storage.close?.()
  }
}

function fixedNow(): Date {
  return new Date("2026-01-01T00:00:00.000Z")
}

function createDeterministicId(): () => string {
  let next = 1
  return () => `id_${next++}`
}
