import { createCrmAdmin } from "./admin.ts"
import { createCrmKernel } from "./kernel.ts"
import { getPostgresSchemaSql } from "./postgres.ts"

const version = "0.1.0"
const admin = createCrmAdmin({ crm: createCrmKernel() })

type CliIo = {
  out: (text: string) => void
  err: (text: string) => void
  readTextFile: (path: string) => Promise<string>
}

const defaultIo: CliIo = {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  readTextFile: (path) => Deno.readTextFile(path),
}

export async function runCli(args: string[], io: CliIo = defaultIo): Promise<number> {
  if (args[0] === "--") args = args.slice(1)

  const [command, ...rest] = args

  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.out(helpText())
    return 0
  }

  if (command === "version" || command === "--version" || command === "-V") {
    io.out(version)
    return 0
  }

  if (command === "doctor") {
    return runDoctor(rest, io)
  }

  if (command === "db") {
    return await runDb(rest, io)
  }

  if (command === "plugins") {
    return await runPlugins(rest, io)
  }

  if (command === "dashboard") {
    return await runDashboard(rest, io)
  }

  io.err(`Unknown command: ${command}\n\n${helpText()}`)
  return 2
}

function runDoctor(args: string[], io: CliIo): number {
  const format = optionValue(args, "--format") ?? "text"
  if (format !== "text" && format !== "json") {
    io.err("Invalid --format value. Expected text or json.")
    return 2
  }

  const result = admin.doctor()

  if (format === "json") {
    io.out(JSON.stringify(result, null, 2))
    return result.status === "fail" ? 1 : 0
  }

  io.out(formatDoctorText(result))
  return result.status === "fail" ? 1 : 0
}

async function runDb(args: string[], io: CliIo): Promise<number> {
  const [command, adapter, target] = args

  if (command === "schema" && adapter === "postgres") {
    io.out(getPostgresSchemaSql().join(";\n\n") + ";")
    return 0
  }

  if (command === "status" && adapter === "sqlite" && target) {
    const format = optionValue(args, "--format") ?? "text"
    if (format !== "text" && format !== "json") {
      io.err("Invalid --format value. Expected text or json.")
      return 2
    }

    try {
      const { getSqliteMigrationStatus } = await import("./sqlite.ts")
      const status = getSqliteMigrationStatus(target)
      io.out(format === "json" ? JSON.stringify(status, null, 2) : formatDbStatusText(status))
      return 0
    } catch (error) {
      io.err(formatDbError("status", "sqlite", error))
      return 1
    }
  }

  if (command === "migrate" && adapter === "sqlite" && target) {
    const format = optionValue(args, "--format") ?? "text"
    if (format !== "text" && format !== "json") {
      io.err("Invalid --format value. Expected text or json.")
      return 2
    }

    try {
      const { migrateSqliteDatabase } = await import("./sqlite.ts")
      const result = migrateSqliteDatabase(target, { dryRun: args.includes("--dry-run") })
      io.out(format === "json" ? JSON.stringify(result, null, 2) : formatDbMigrateText(result))
      return 0
    } catch (error) {
      io.err(formatDbError("migrate", "sqlite", error))
      return 1
    }
  }

  io.err(dbHelpText())
  return 2
}

async function runPlugins(args: string[], io: CliIo): Promise<number> {
  const [command, path] = args

  if (command !== "validate" || !path) {
    io.err(pluginsHelpText())
    return 2
  }

  try {
    let text: string
    try {
      text = await io.readTextFile(path)
    } catch (error) {
      io.err(
        `Could not read plugin manifest: ${redactSensitiveText(path)}\n${safeErrorMessage(error)}`,
      )
      return 1
    }

    const result = admin.validatePluginManifest(JSON.parse(text))
    if (!result.ok) {
      io.err(`${result.error.code}: ${result.error.message}`)
      return 1
    }

    io.out(
      [
        "Plugin manifest ok",
        `id: ${result.summary.id}`,
        `name: ${result.summary.name}`,
        `version: ${result.summary.version}`,
        `capabilities: ${result.summary.capabilities}`,
      ].join("\n"),
    )
    return 0
  } catch (error) {
    if (error instanceof SyntaxError) {
      io.err(`Invalid JSON: ${error.message}`)
      return 1
    }
    throw error
  }
}

async function runDashboard(args: string[], io: CliIo): Promise<number> {
  const dbPath = optionValue(args, "--db") ?? "./bare-crm.db"
  const workspaceId = optionValue(args, "--workspace") ?? "workspace_1"
  const hostname = optionValue(args, "--host") ?? "127.0.0.1"
  const portValue = optionValue(args, "--port") ?? "8787"
  const port = Number(portValue)

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    io.err("Invalid --port value. Expected a TCP port between 1 and 65535.")
    return 2
  }

  const { startDashboardServer } = await import("./dashboard.ts")
  const server = startDashboardServer({ dbPath, workspaceId, hostname, port })

  io.out([
    "Bare CRM dashboard running",
    "",
    `URL: http://${hostname}:${server.addr.port}`,
    `Workspace: ${workspaceId}`,
    `Database: ${dbPath}`,
    "",
    "Press Ctrl-C to stop.",
  ].join("\n"))

  await server.finished
  return 0
}

function optionValue(args: string[], name: string): string | undefined {
  const equalsPrefix = `${name}=`
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix))
  if (equalsValue) return equalsValue.slice(equalsPrefix.length)

  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function formatDoctorText(result: {
  status: "ok" | "warn" | "fail"
  checkedAt: string
  redacted: boolean
  externalTelemetry: boolean
  checks: Array<{ status: "ok" | "warn" | "fail"; code: string; message: string }>
}): string {
  return [
    "Bare CRM Doctor",
    "",
    `Status: ${result.status}`,
    `Checked at: ${result.checkedAt}`,
    `Redacted: ${result.redacted}`,
    `External telemetry: ${result.externalTelemetry}`,
    "",
    ...result.checks.map((check) =>
      `${check.status.toUpperCase().padEnd(4)} ${check.code}: ${check.message}`
    ),
    "",
    "No raw CRM records or event snapshots were read or exported by this report.",
  ].join("\n")
}

function formatDbStatusText(status: {
  adapter: string
  currentVersion: string | null
  applied: string[]
  pending: Array<{ version: string; name: string }>
}): string {
  return [
    "CRM database status",
    "",
    `Adapter: ${status.adapter}`,
    `Current version: ${status.currentVersion ?? "none"}`,
    `Applied migrations: ${status.applied.length}`,
    `Pending migrations: ${status.pending.length}`,
    ...formatMigrationList("Pending", status.pending),
  ].join("\n")
}

function formatDbMigrateText(result: {
  adapter: string
  currentVersion: string | null
  pending: Array<{ version: string; name: string }>
  appliedNow: Array<{ version: string; name: string }>
  dryRun: boolean
}): string {
  return [
    result.dryRun ? "CRM database migration dry run" : "CRM database migrated",
    "",
    `Adapter: ${result.adapter}`,
    `Current version: ${result.currentVersion ?? "none"}`,
    `Applied now: ${result.appliedNow.length}`,
    `Pending migrations: ${result.pending.length}`,
    ...formatMigrationList(result.dryRun ? "Would apply" : "Applied", result.appliedNow),
  ].join("\n")
}

function formatMigrationList(
  title: string,
  migrations: Array<{ version: string; name: string }>,
): string[] {
  if (migrations.length === 0) return []
  return [
    "",
    `${title}:`,
    ...migrations.map((migration) => `- ${migration.version} ${migration.name}`),
  ]
}

function formatDbError(action: string, adapter: string, error: unknown): string {
  if (isMigrationError(error)) {
    return [
      `CRM database ${action} failed`,
      "",
      `Adapter: ${adapter}`,
      `Migration: ${error.migration.version} ${error.migration.name}`,
      "",
      "Error:",
      redactSensitiveText(error.message),
      "",
      "No later migrations were applied.",
      "The failed migration was not recorded as complete.",
    ].join("\n")
  }

  return [
    `CRM database ${action} failed`,
    "",
    `Adapter: ${adapter}`,
    "",
    "Error:",
    safeErrorMessage(error),
  ].join("\n")
}

function isMigrationError(error: unknown): error is Error & {
  migration: { version: string; name: string }
} {
  return error instanceof Error && error.name.endsWith("MigrationError") &&
    "migration" in error &&
    typeof (error as { migration?: { version?: unknown } }).migration?.version === "string" &&
    typeof (error as { migration?: { name?: unknown } }).migration?.name === "string"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeErrorMessage(error: unknown): string {
  return redactSensitiveText(errorMessage(error))
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(
      /\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\b(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[redacted]")
}

function helpText(): string {
  return [
    "Usage: crm <command>",
    "",
    "Commands:",
    "  doctor                         Run privacy-preserving readiness checks",
    "  doctor --format json           Print doctor output as JSON",
    "  db schema postgres             Print official Postgres schema SQL",
    "  db status sqlite <path>        Show SQLite schema migration status",
    "  db migrate sqlite <path>       Apply pending SQLite schema migrations",
    "  db migrate sqlite <path> --dry-run",
    "  plugins validate <path>        Validate a plugin manifest",
    "  dashboard --db <path>          Run the optional local dashboard",
    "  version                        Print CLI version",
    "  help                           Show this help",
  ].join("\n")
}

function dbHelpText(): string {
  return [
    "Usage: crm db <command>",
    "",
    "Commands:",
    "  db schema postgres             Print official Postgres schema SQL",
    "  db status sqlite <path>        Show SQLite schema migration status",
    "  db migrate sqlite <path>       Apply pending SQLite schema migrations",
    "  db migrate sqlite <path> --dry-run",
  ].join("\n")
}

function pluginsHelpText(): string {
  return [
    "Usage: crm plugins <command>",
    "",
    "Commands:",
    "  plugins validate <path>        Validate a plugin manifest",
  ].join("\n")
}

if (import.meta.main) {
  Deno.exit(await runCli(Deno.args))
}
