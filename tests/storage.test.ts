import { assertEquals } from "jsr:@std/assert"
import { createMemoryStorage, type StorageApi } from "../src/index.ts"
import type { Person } from "../src/index.ts"

Deno.test("memory Storage API satisfies base persistence behavior", async () => {
  await runStorageConformanceSuite(createMemoryStorage())
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
  })
}
