import { assertEquals } from "jsr:@std/assert"
import { runCli } from "../src/cli.ts"

function createTestIo(files: Record<string, string> = {}) {
  const stdout: string[] = []
  const stderr: string[] = []

  return {
    io: {
      out: (text: string) => stdout.push(text),
      err: (text: string) => stderr.push(text),
      readTextFile: async (path: string) => {
        const value = files[path]
        if (value === undefined) throw new Error("file not found")
        return value
      },
    },
    stdout,
    stderr,
  }
}

Deno.test("CLI help lists small command surface", async () => {
  const { io, stdout } = createTestIo()

  const code = await runCli(["help"], io)

  assertEquals(code, 0)
  assertEquals(stdout[0].includes("Usage: crm <command>"), true)
  assertEquals(stdout[0].includes("db schema postgres"), true)
  assertEquals(stdout[0].includes("db status sqlite <path>"), true)
  assertEquals(stdout[0].includes("db migrate sqlite <path>"), true)
  assertEquals(stdout[0].includes("plugins validate <path>"), true)
})

Deno.test("CLI accepts a task-style argument separator", async () => {
  const { io, stdout } = createTestIo()

  const code = await runCli(["--", "help"], io)

  assertEquals(code, 0)
  assertEquals(stdout[0].includes("Usage: crm <command>"), true)
})

Deno.test("doctor reports redacted privacy-preserving checks", async () => {
  const { io, stdout } = createTestIo()

  const code = await runCli(["doctor", "--format", "json"], io)
  const result = JSON.parse(stdout[0])

  assertEquals(code, 0)
  assertEquals(result.status, "warn")
  assertEquals(typeof result.checkedAt, "string")
  assertEquals(result.redacted, true)
  assertEquals(result.externalTelemetry, false)
  assertEquals(Array.isArray(result.checks), true)
  assertEquals(
    result.checks.some((check: { code: string }) => check.code === "privacy.no_external_telemetry"),
    true,
  )
})

Deno.test("doctor output does not include private fixture values", async () => {
  const { io, stdout } = createTestIo()

  const code = await runCli(["doctor"], io)

  assertEquals(code, 0)
  assertEquals(stdout[0].includes("ada@example.com"), false)
  assertEquals(stdout[0].includes("Ada Lovelace"), false)
  assertEquals(stdout[0].includes("123 Main Street"), false)
  assertEquals(stdout[0].includes("No raw CRM records or event snapshots"), true)
})

Deno.test("doctor rejects invalid output formats", async () => {
  const { io, stderr } = createTestIo()

  const code = await runCli(["doctor", "--format", "xml"], io)

  assertEquals(code, 2)
  assertEquals(stderr[0], "Invalid --format value. Expected text or json.")
})

Deno.test("unknown commands return help and a usage error", async () => {
  const { io, stderr } = createTestIo()

  const code = await runCli(["unknown"], io)

  assertEquals(code, 2)
  assertEquals(stderr[0].includes("Unknown command: unknown"), true)
  assertEquals(stderr[0].includes("Usage: crm <command>"), true)
})

Deno.test("db schema postgres prints official schema SQL", async () => {
  const { io, stdout } = createTestIo()

  const code = await runCli(["db", "schema", "postgres"], io)

  assertEquals(code, 0)
  assertEquals(stdout[0].includes("create table if not exists bare_crm_records"), true)
  assertEquals(stdout[0].includes("create table if not exists bare_crm_events"), true)
  assertEquals(stdout[0].includes("create table if not exists bare_crm_migrations"), true)
})

Deno.test("db status sqlite reports pending migrations before migration", async () => {
  const path = await Deno.makeTempFile({ suffix: ".db" })
  const { io, stdout } = createTestIo()

  const code = await runCli(["db", "status", "sqlite", path, "--format", "json"], io)
  const result = JSON.parse(stdout[0])

  assertEquals(code, 0)
  assertEquals(result.adapter, "sqlite")
  assertEquals(result.currentVersion, null)
  assertEquals(result.applied, [])
  assertEquals(result.pending, [{ version: "001", name: "initial_schema" }])
})

Deno.test("db migrate sqlite applies migration ledger without printing private data", async () => {
  const path = await Deno.makeTempFile({ suffix: ".db" })
  const { io, stdout } = createTestIo()

  const code = await runCli(["db", "migrate", "sqlite", path], io)

  assertEquals(code, 0)
  assertEquals(stdout[0].includes("CRM database migrated"), true)
  assertEquals(stdout[0].includes("001 initial_schema"), true)
  assertEquals(stdout[0].includes("ada@example.com"), false)
  assertEquals(stdout[0].includes("Ada Lovelace"), false)
})

Deno.test("db migrate sqlite is stable when rerun", async () => {
  const path = await Deno.makeTempFile({ suffix: ".db" })
  const first = createTestIo()
  const second = createTestIo()

  assertEquals(await runCli(["db", "migrate", "sqlite", path], first.io), 0)
  const code = await runCli(["db", "migrate", "sqlite", path, "--format", "json"], second.io)
  const result = JSON.parse(second.stdout[0])

  assertEquals(code, 0)
  assertEquals(result.currentVersion, "001")
  assertEquals(result.applied, ["001"])
  assertEquals(result.appliedNow, [])
  assertEquals(result.pending, [])
})

Deno.test("db migrate sqlite dry-run does not apply migrations", async () => {
  const path = await Deno.makeTempFile({ suffix: ".db" })
  const dryRun = createTestIo()
  const status = createTestIo()

  const dryRunCode = await runCli(["db", "migrate", "sqlite", path, "--dry-run"], dryRun.io)
  const statusCode = await runCli(["db", "status", "sqlite", path, "--format", "json"], status.io)
  const result = JSON.parse(status.stdout[0])

  assertEquals(dryRunCode, 0)
  assertEquals(statusCode, 0)
  assertEquals(dryRun.stdout[0].includes("CRM database migration dry run"), true)
  assertEquals(result.currentVersion, null)
  assertEquals(result.pending, [{ version: "001", name: "initial_schema" }])
})

Deno.test("db commands reject invalid output formats", async () => {
  const path = await Deno.makeTempFile({ suffix: ".db" })
  const { io, stderr } = createTestIo()

  const code = await runCli(["db", "status", "sqlite", path, "--format", "xml"], io)

  assertEquals(code, 2)
  assertEquals(stderr[0], "Invalid --format value. Expected text or json.")
})

Deno.test("unknown db commands return db help", async () => {
  const { io, stderr } = createTestIo()

  const code = await runCli(["db", "migrate"], io)

  assertEquals(code, 2)
  assertEquals(stderr[0].includes("Usage: crm db <command>"), true)
  assertEquals(stderr[0].includes("db migrate sqlite <path>"), true)
})

Deno.test("plugins validate accepts a valid manifest", async () => {
  const { io, stdout } = createTestIo({
    "plugin.json": JSON.stringify({
      id: "example.valid",
      name: "Valid plugin",
      version: "0.1.0",
      capabilities: ["crm:read:record.search", "plugin:commands"],
      contributes: { commands: [] },
    }),
  })

  const code = await runCli(["plugins", "validate", "plugin.json"], io)

  assertEquals(code, 0)
  assertEquals(stdout[0].includes("Plugin manifest ok"), true)
  assertEquals(stdout[0].includes("id: example.valid"), true)
})

Deno.test("plugins validate rejects storage capabilities", async () => {
  const { io, stderr } = createTestIo({
    "plugin.json": JSON.stringify({
      id: "example.bad",
      name: "Bad plugin",
      version: "0.1.0",
      capabilities: ["storage:read"],
      contributes: {},
    }),
  })

  const code = await runCli(["plugins", "validate", "plugin.json"], io)

  assertEquals(code, 1)
  assertEquals(stderr[0].includes("plugin.capability_forbidden"), true)
})

Deno.test("plugins validate rejects invalid JSON", async () => {
  const { io, stderr } = createTestIo({ "plugin.json": "{" })

  const code = await runCli(["plugins", "validate", "plugin.json"], io)

  assertEquals(code, 1)
  assertEquals(stderr[0].includes("Invalid JSON:"), true)
})

Deno.test("plugins validate reports missing files without throwing", async () => {
  const { io, stderr } = createTestIo()

  const code = await runCli(["plugins", "validate", "missing.json"], io)

  assertEquals(code, 1)
  assertEquals(stderr[0].includes("Could not read plugin manifest: missing.json"), true)
  assertEquals(stderr[0].includes("file not found"), true)
})

Deno.test("plugins validate requires a manifest path", async () => {
  const { io, stderr } = createTestIo()

  const code = await runCli(["plugins", "validate"], io)

  assertEquals(code, 2)
  assertEquals(stderr[0].includes("Usage: crm plugins <command>"), true)
})
