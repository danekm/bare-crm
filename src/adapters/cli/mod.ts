import { createCrmAdmin } from "../../admin.ts"
import { createCrmKernel } from "../../kernel.ts"
import { getPostgresSchemaSql } from "../../postgres.ts"
import { runDb } from "./commands/db.ts"
import { runDoctor } from "./commands/doctor.ts"
import { runPlugins } from "./commands/plugins.ts"
import { helpText } from "./help.ts"
import { defaultIo } from "./io.ts"
import type { CliContext, CliIo, CliRunOptions } from "./types.ts"

const defaultVersion = "0.1.0"

export async function runCli(
  args: string[],
  optionsOrIo: CliRunOptions | CliIo = {},
): Promise<number> {
  const options = isCliIo(optionsOrIo) ? { io: optionsOrIo } : optionsOrIo
  const context = createCliContext(options)

  if (args[0] === "--") args = args.slice(1)

  const [command, ...rest] = args

  if (!command || command === "help" || command === "--help" || command === "-h") {
    context.io.out(helpText())
    return 0
  }

  if (command === "version" || command === "--version" || command === "-V") {
    context.io.out(context.version)
    return 0
  }

  if (command === "doctor") {
    return runDoctor(rest, context)
  }

  if (command === "db") {
    return await runDb(rest, context)
  }

  if (command === "plugins") {
    return await runPlugins(rest, context)
  }

  context.io.err(`Unknown command: ${command}\n\n${helpText()}`)
  return 2
}

function createCliContext(options: CliRunOptions): CliContext {
  return {
    io: options.io ?? defaultIo,
    admin: options.admin ?? createCrmAdmin({ crm: createCrmKernel() }),
    version: options.version ?? defaultVersion,
    getPostgresSchemaSql: options.getPostgresSchemaSql ?? getPostgresSchemaSql,
    getSqliteMigrationStatus: options.getSqliteMigrationStatus,
    migrateSqliteDatabase: options.migrateSqliteDatabase,
  }
}

function isCliIo(value: CliRunOptions | CliIo): value is CliIo {
  return "out" in value && "err" in value && "readTextFile" in value
}

export type { CliDependencies, CliIo, CliRunOptions } from "./types.ts"
