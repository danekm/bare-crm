import { assertEquals, assertRejects } from "jsr:@std/assert"
import { createMemoryStorage, type StorageApi, StorageConflictError } from "../src/index.ts"
import { createSqliteMemoryStorage } from "../src/sqlite.ts"
import type { Company, CrmEvent, Person } from "../src/index.ts"

type CloseableStorage = StorageApi & { close?: () => void }

const storageScenarios: Array<{ name: string; createStorage: () => CloseableStorage }> = [
  { name: "memory", createStorage: createMemoryStorage },
  { name: "SQLite", createStorage: createSqliteMemoryStorage },
]

for (const scenario of storageScenarios) {
  Deno.test(`${scenario.name}: Storage API persists records, events, and idempotency`, async () => {
    await withStorage(scenario, async (storage) => {
      const person = personRecord({ id: "person_1", name: "Ada Lovelace" })
      const event = eventRecord({ id: "event_1", record: person })

      await storage.transaction(async (tx) => {
        await tx.put(person, { expectedVersion: 0 })
        await tx.appendEvent(event)
        await tx.saveIdempotencyResult("workspace_1:person.create:key_1", person)
      })

      await storage.transaction(async (tx) => {
        assertEquals(
          await tx.get({ workspaceId: "workspace_1", type: "person", id: "person_1" }),
          person,
        )
        assertEquals(await tx.search({ workspaceId: "workspace_1", type: "person", text: "ada" }), [
          person,
        ])
        assertEquals(await tx.listEvents({ workspaceId: "workspace_1" }), [event])
        assertEquals(await tx.getIdempotencyResult("workspace_1:person.create:key_1"), person)
      })
    })
  })

  Deno.test(`${scenario.name}: Storage API search filters are composable`, async () => {
    await withStorage(scenario, async (storage) => {
      const target = personRecord({
        id: "person_1",
        name: "Ada Lovelace",
        updatedAt: "2026-01-03T00:00:00.000Z",
        ownerId: "user_1",
        source: "import",
        tags: ["vip", "newsletter"],
        externalRefs: [{ system: "hubspot", id: "hs_1" }],
      })
      const wrongOwner = personRecord({
        id: "person_2",
        name: "Grace Hopper",
        updatedAt: "2026-01-04T00:00:00.000Z",
        ownerId: "user_2",
        source: "import",
        tags: ["vip", "newsletter"],
        externalRefs: [{ system: "hubspot", id: "hs_2" }],
      })
      const archived = personRecord({
        id: "person_3",
        name: "Ada Archived",
        updatedAt: "2026-01-05T00:00:00.000Z",
        ownerId: "user_1",
        source: "import",
        tags: ["vip", "newsletter"],
        archivedAt: "2026-01-06T00:00:00.000Z",
        externalRefs: [{ system: "hubspot", id: "hs_1" }],
      })
      const company = companyRecord({ id: "company_1", name: "Ada Systems" })

      await storage.transaction(async (tx) => {
        await tx.put(target, { expectedVersion: 0 })
        await tx.put(wrongOwner, { expectedVersion: 0 })
        await tx.put(archived, { expectedVersion: 0 })
        await tx.put(company, { expectedVersion: 0 })
      })

      await storage.transaction(async (tx) => {
        assertEquals(
          await tx.search({
            workspaceId: "workspace_1",
            type: "person",
            text: "ada",
            ownerId: "user_1",
            source: "import",
            tags: ["vip", "newsletter"],
            externalRef: { system: "hubspot", id: "hs_1" },
          }),
          [target],
        )
        assertEquals(
          await tx.search({
            workspaceId: "workspace_1",
            type: "person",
            text: "ada",
            includeArchived: true,
            ownerId: "user_1",
            source: "import",
            tags: ["vip"],
            externalRef: { system: "hubspot", id: "hs_1" },
          }),
          [archived, target],
        )
      })
    })
  })

  Deno.test(`${scenario.name}: Storage API is workspace and type isolated`, async () => {
    await withStorage(scenario, async (storage) => {
      const workspaceOnePerson = personRecord({ id: "shared_id", workspaceId: "workspace_1" })
      const workspaceTwoPerson = personRecord({
        id: "shared_id",
        workspaceId: "workspace_2",
        name: "Grace Hopper",
      })
      const company = companyRecord({ id: "shared_id", workspaceId: "workspace_1" })

      await storage.transaction(async (tx) => {
        await tx.put(workspaceOnePerson, { expectedVersion: 0 })
        await tx.put(workspaceTwoPerson, { expectedVersion: 0 })
        await tx.put(company, { expectedVersion: 0 })
      })

      await storage.transaction(async (tx) => {
        assertEquals(
          await tx.get({ workspaceId: "workspace_1", type: "person", id: "shared_id" }),
          workspaceOnePerson,
        )
        assertEquals(
          await tx.get({ workspaceId: "workspace_2", type: "person", id: "shared_id" }),
          workspaceTwoPerson,
        )
        assertEquals(
          await tx.get({ workspaceId: "workspace_1", type: "company", id: "shared_id" }),
          company,
        )
        assertEquals(
          (await tx.search({ workspaceId: "workspace_1", type: "person" })).map((record) =>
            record.workspaceId
          ),
          ["workspace_1"],
        )
      })
    })
  })

  Deno.test(`${scenario.name}: Storage API enforces optimistic versions`, async () => {
    await withStorage(scenario, async (storage) => {
      const person = personRecord({ id: "person_1", version: 1 })
      const updated = personRecord({
        id: "person_1",
        name: "Ada Byron",
        version: 2,
        updatedAt: "2026-01-02T00:00:00.000Z",
      })

      await storage.transaction(async (tx) => {
        await tx.put(person, { expectedVersion: 0 })
        await tx.put(updated, { expectedVersion: 1 })
      })

      await assertRejects(
        () =>
          storage.transaction((tx) =>
            tx.put(personRecord({ id: "person_1", version: 3 }), { expectedVersion: 1 })
          ),
        StorageConflictError,
      )
      await assertRejects(
        () =>
          storage.transaction((tx) =>
            tx.put(personRecord({ id: "person_1", version: 1 }), { expectedVersion: 0 })
          ),
        StorageConflictError,
      )

      await storage.transaction(async (tx) => {
        assertEquals(
          await tx.get({ workspaceId: "workspace_1", type: "person", id: "person_1" }),
          updated,
        )
      })
    })
  })

  Deno.test(`${scenario.name}: Storage API rolls back failed transactions`, async () => {
    await withStorage(scenario, async (storage) => {
      await assertRejects(
        () =>
          storage.transaction(async (tx) => {
            await tx.put(personRecord({ id: "person_1" }), { expectedVersion: 0 })
            await tx.appendEvent(eventRecord({ id: "event_1" }))
            throw new Error("stop")
          }),
        Error,
        "stop",
      )

      await storage.transaction(async (tx) => {
        assertEquals(
          await tx.get({ workspaceId: "workspace_1", type: "person", id: "person_1" }),
          null,
        )
        assertEquals(await tx.listEvents({ workspaceId: "workspace_1" }), [])
      })
    })
  })

  Deno.test(`${scenario.name}: Storage API event listing is workspace scoped and limit aware`, async () => {
    await withStorage(scenario, async (storage) => {
      const eventOne = eventRecord({ id: "event_1", occurredAt: "2026-01-01T00:00:00.000Z" })
      const eventTwo = eventRecord({ id: "event_2", occurredAt: "2026-01-02T00:00:00.000Z" })
      const otherWorkspace = eventRecord({
        id: "event_3",
        workspaceId: "workspace_2",
        occurredAt: "2026-01-03T00:00:00.000Z",
      })

      await storage.transaction(async (tx) => {
        await tx.appendEvent(eventOne)
        await tx.appendEvent(eventTwo)
        await tx.appendEvent(otherWorkspace)
      })

      await storage.transaction(async (tx) => {
        assertEquals(await tx.listEvents({ workspaceId: "workspace_1", limit: 1 }), [eventTwo])
        assertEquals(await tx.listEvents({ workspaceId: "workspace_2" }), [otherWorkspace])
      })
    })
  })
}

async function withStorage(
  scenario: { createStorage: () => CloseableStorage },
  fn: (storage: StorageApi) => Promise<void>,
): Promise<void> {
  const storage = scenario.createStorage()
  try {
    await fn(storage)
  } finally {
    storage.close?.()
  }
}

function personRecord(overrides: Partial<Person> = {}): Person {
  return {
    id: "person_1",
    type: "person",
    workspaceId: "workspace_1",
    name: "Ada Lovelace",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "manual",
    version: 1,
    ...overrides,
  }
}

function companyRecord(overrides: Partial<Company> = {}): Company {
  return {
    id: "company_1",
    type: "company",
    workspaceId: "workspace_1",
    name: "Analytical Engines Ltd",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "manual",
    version: 1,
    ...overrides,
  }
}

function eventRecord(overrides: Partial<CrmEvent> = {}): CrmEvent {
  const record = overrides.record ?? personRecord({
    workspaceId: overrides.workspaceId ?? "workspace_1",
  })

  return {
    id: "event_1",
    workspaceId: record.workspaceId,
    name: "person.created",
    record,
    occurredAt: "2026-01-01T00:00:00.000Z",
    writeId: "write_1",
    ...overrides,
  }
}
