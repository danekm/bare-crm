import { assertEquals } from "jsr:@std/assert"
import { createCrmAdmin, createCrmKernel } from "../src/index.ts"
import { runCli } from "../src/cli.ts"

const privateValues = [
  "Ada Lovelace",
  "ada@example.com",
  "123 Main Street",
  "refresh_token=super-secret-refresh-token",
  "Internal note body with private renewal terms",
  "Collection summary with confidential pricing",
]

Deno.test("privacy: admin event metadata does not expose record snapshots", async () => {
  const crm = createCrmKernel({
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: deterministicIds([
      "write_person",
      "person_1",
      "event_person",
      "write_note",
      "note_1",
      "event_note",
      "write_collection",
      "collection_1",
      "event_collection",
    ]),
  })
  const admin = createCrmAdmin({ crm })

  const person = await crm.write("person.create", {
    workspaceId: "workspace_1",
    name: "Ada Lovelace",
    emails: [{ value: "ada@example.com", primary: true }],
    location: "123 Main Street",
    externalRefs: [{
      system: "private-system",
      id: "private-person",
      url: "https://example.test/contact?refresh_token=super-secret-refresh-token",
    }],
  })
  const note = await crm.write("note.create", {
    workspaceId: "workspace_1",
    body: "Internal note body with private renewal terms",
    related: [{ type: "person", id: person.id }],
  })
  await crm.write("collection.create", {
    workspaceId: "workspace_1",
    title: "Private renewal collection",
    kind: "sales.renewal",
    related: [{ type: "note", id: note.id }],
    outcome: {
      code: "pending",
      summary: "Collection summary with confidential pricing",
    },
  })

  const metadata = await admin.listEventMetadata({ workspaceId: "workspace_1" })
  const serialized = JSON.stringify(metadata)

  assertEquals(serialized.includes('"record":'), false)
  assertNoPrivateValues(serialized)
})

Deno.test("privacy: CLI operator errors redact private-looking values", async () => {
  const io = createTestIo()
  const path = "/tmp/ada@example.com/sk_live_superSecretPluginKey/plugin.json"

  const code = await runCli(["plugins", "validate", path], io)
  const output = io.stderr.join("\n")

  assertEquals(code, 1)
  assertEquals(output.includes("ada@example.com"), false)
  assertEquals(output.includes("sk_live_superSecretPluginKey"), false)
  assertEquals(output.includes("[redacted-email]"), true)
  assertEquals(output.includes("[redacted-token]"), true)
})

function assertNoPrivateValues(output: string): void {
  for (const value of privateValues) {
    assertEquals(output.includes(value), false, `Expected output to omit private value: ${value}`)
  }
}

function createTestIo() {
  const stdout: string[] = []
  const stderr: string[] = []

  return {
    stdout,
    stderr,
    out: (text: string) => stdout.push(text),
    err: (text: string) => stderr.push(text),
    readTextFile: async () => {
      throw new Error("file not found")
    },
  }
}

function deterministicIds(ids: string[]): () => string {
  let index = 0
  return () => ids[index++] ?? `id_${index}`
}
