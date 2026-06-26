import { assertEquals } from "jsr:@std/assert"
import { createCrmAdmin, createCrmKernel } from "../src/index.ts"

Deno.test("admin doctor returns structured privacy-preserving report", () => {
  const admin = createCrmAdmin({
    crm: createCrmKernel(),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  })

  const report = admin.doctor()

  assertEquals(report.status, "warn")
  assertEquals(report.checkedAt, "2026-01-01T00:00:00.000Z")
  assertEquals(report.redacted, true)
  assertEquals(report.externalTelemetry, false)
  assertEquals(
    report.checks.some((check) => check.code === "privacy.no_external_telemetry"),
    true,
  )
})

Deno.test("admin plugin validation returns stable summaries and structured errors", () => {
  const admin = createCrmAdmin({ crm: createCrmKernel() })

  const valid = admin.validatePluginManifest({
    id: "example.valid",
    name: "Valid plugin",
    version: "0.1.0",
    capabilities: ["crm:read:record.search", "plugin:commands"],
    contributes: {},
  })
  const invalid = admin.validatePluginManifest({
    id: "example.bad",
    name: "Bad plugin",
    version: "0.1.0",
    capabilities: ["storage:read"],
    contributes: {},
  })

  assertEquals(valid.ok, true)
  if (valid.ok) {
    assertEquals(valid.summary, {
      id: "example.valid",
      name: "Valid plugin",
      version: "0.1.0",
      capabilities: 2,
      kernelCapabilities: ["crm:read:record.search"],
    })
  }

  assertEquals(invalid.ok, false)
  if (!invalid.ok) {
    assertEquals(invalid.error.code, "plugin.capability_forbidden")
  }
})

Deno.test("admin event metadata omits committed record snapshots", async () => {
  const crm = createCrmKernel({
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: deterministicIds(["write_1", "person_1", "event_1"]),
  })
  const admin = createCrmAdmin({ crm })

  await crm.write(
    "person.create",
    {
      workspaceId: "workspace_1",
      name: "Ada Lovelace",
      emails: [{ value: "ada@example.com", primary: true }],
    },
    {
      context: {
        workspaceId: "workspace_1",
        actor: { type: "human", id: "user_1", displayName: "Ada Admin" },
        capabilities: ["crm:write:person.create"],
        correlationId: "correlation_1",
      },
      idempotencyKey: "import:row:1",
    },
  )

  const metadata = await admin.listEventMetadata({ workspaceId: "workspace_1" })

  assertEquals(metadata, [{
    id: "event_1",
    workspaceId: "workspace_1",
    name: "person.created",
    operation: "person.create",
    recordRef: { type: "person", id: "person_1" },
    recordVersion: 1,
    occurredAt: "2026-01-01T00:00:00.000Z",
    writeId: "write_1",
    source: "manual",
    actorType: "human",
    actorId: "user_1",
    actorDisplayName: "Ada Admin",
    correlationId: "correlation_1",
    idempotencyKey: "import:row:1",
  }])

  const serialized = JSON.stringify(metadata)
  assertEquals(serialized.includes('"record":'), false)
  assertEquals(serialized.includes("Ada Lovelace"), false)
  assertEquals(serialized.includes("ada@example.com"), false)
})

function deterministicIds(ids: string[]): () => string {
  let index = 0
  return () => ids[index++] ?? `id_${index}`
}
