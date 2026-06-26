import { redactSensitiveText, safeErrorMessage } from "./redaction.ts"
import type { MigrationResult, MigrationStatus, MigrationSummary } from "./types.ts"

export function formatDoctorText(result: {
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

export function formatDbStatusText(status: MigrationStatus): string {
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

export function formatDbMigrateText(result: MigrationResult): string {
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

export function formatDbError(action: string, adapter: string, error: unknown): string {
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

function formatMigrationList(title: string, migrations: MigrationSummary[]): string[] {
  if (migrations.length === 0) return []
  return [
    "",
    `${title}:`,
    ...migrations.map((migration) => `- ${migration.version} ${migration.name}`),
  ]
}

function isMigrationError(error: unknown): error is Error & {
  migration: { version: string; name: string }
} {
  return error instanceof Error && error.name.endsWith("MigrationError") &&
    "migration" in error &&
    typeof (error as { migration?: { version?: unknown } }).migration?.version === "string" &&
    typeof (error as { migration?: { name?: unknown } }).migration?.name === "string"
}
