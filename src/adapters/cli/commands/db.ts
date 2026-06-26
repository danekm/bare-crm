import { dbHelpText } from "../help.ts"
import { optionValue } from "../options.ts"
import { formatDbError, formatDbMigrateText, formatDbStatusText } from "../format.ts"
import type { CliContext } from "../types.ts"

export async function runDb(args: string[], context: CliContext): Promise<number> {
  const [command, adapter, target] = args

  if (command === "schema" && adapter === "postgres") {
    context.io.out(context.getPostgresSchemaSql().join(";\n\n") + ";")
    return 0
  }

  if (command === "status" && adapter === "sqlite" && target) {
    const format = optionValue(args, "--format") ?? "text"
    if (format !== "text" && format !== "json") {
      context.io.err("Invalid --format value. Expected text or json.")
      return 2
    }

    try {
      const getStatus = context.getSqliteMigrationStatus ?? await loadSqliteMigrationStatus()
      const status = await getStatus(target)
      context.io.out(
        format === "json" ? JSON.stringify(status, null, 2) : formatDbStatusText(status),
      )
      return 0
    } catch (error) {
      context.io.err(formatDbError("status", "sqlite", error))
      return 1
    }
  }

  if (command === "migrate" && adapter === "sqlite" && target) {
    const format = optionValue(args, "--format") ?? "text"
    if (format !== "text" && format !== "json") {
      context.io.err("Invalid --format value. Expected text or json.")
      return 2
    }

    try {
      const migrate = context.migrateSqliteDatabase ?? await loadSqliteMigrator()
      const result = await migrate(target, { dryRun: args.includes("--dry-run") })
      context.io.out(
        format === "json" ? JSON.stringify(result, null, 2) : formatDbMigrateText(result),
      )
      return 0
    } catch (error) {
      context.io.err(formatDbError("migrate", "sqlite", error))
      return 1
    }
  }

  context.io.err(dbHelpText())
  return 2
}

async function loadSqliteMigrationStatus() {
  const sqlite = await import("../../../sqlite.ts")
  return sqlite.getSqliteMigrationStatus
}

async function loadSqliteMigrator() {
  const sqlite = await import("../../../sqlite.ts")
  return sqlite.migrateSqliteDatabase
}
