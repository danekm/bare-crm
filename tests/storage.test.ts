import { assertEquals, assertRejects } from "jsr:@std/assert"
import { createMemoryStorage, type StorageApi, StorageConflictError } from "../src/index.ts"
import { createSqliteMemoryStorage } from "../src/sqlite.ts"
import type { Person } from "../src/index.ts"

Deno.test("memory Storage API satisfies base persistence behavior", async () => {
  await runStorageConformanceSuite(createMemoryStorage())
})

Deno.test("SQLite Storage API satisfies base persistence behavior", async () => {
  const storage = createSqliteMemoryStorage()
  try {
    await runStorageConformanceSuite(storage)
  } finally {
    storage.close()
  }
})

async function runStorageConformanceSuite(storage: StorageApi): Promise<void> {
  const person: Person = {
    id: "person_1",
    type: "person",
    workspaceId: "workspace_1",
    name: "Ada Lovelace",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "manual",
    version: 1,
  }

  await storage.transaction(async (tx) => {
    await tx.put(person)
    await tx.appendEvent({
      id: "event_1",
      workspaceId: "workspace_1",
      name: "person.created",
      record: person,
      occurredAt: "2026-01-01T00:00:00.000Z",
      writeId: "write_1",
    })
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
    assertEquals(await tx.listEvents({ workspaceId: "workspace_1" }), [{
      id: "event_1",
      workspaceId: "workspace_1",
      name: "person.created",
      record: person,
      occurredAt: "2026-01-01T00:00:00.000Z",
      writeId: "write_1",
    }])
    assertEquals(await tx.getIdempotencyResult("workspace_1:person.create:key_1"), person)
  })

  await storage.transaction(async (tx) => {
    await assertRejects(
      () => tx.put({ ...person, version: 2 }, { expectedVersion: 2 }),
      StorageConflictError,
    )
  })
}
