import type { CrmAdmin } from "../../admin.ts"

export type CliIo = {
  out: (text: string) => void
  err: (text: string) => void
  readTextFile: (path: string) => Promise<string>
}

export type MigrationSummary = {
  version: string
  name: string
}

export type MigrationStatus = {
  adapter: string
  currentVersion: string | null
  applied: string[]
  pending: MigrationSummary[]
}

export type MigrationResult = MigrationStatus & {
  appliedNow: MigrationSummary[]
  dryRun: boolean
}

export type CliDependencies = {
  admin?: Pick<CrmAdmin, "doctor" | "validatePluginManifest">
  version?: string
  getPostgresSchemaSql?: () => string[]
  getSqliteMigrationStatus?: (path: string) => MigrationStatus | Promise<MigrationStatus>
  migrateSqliteDatabase?: (
    path: string,
    options: { dryRun: boolean },
  ) => MigrationResult | Promise<MigrationResult>
}

export type CliRunOptions = CliDependencies & {
  io?: CliIo
}

export type CliContext =
  & Required<Pick<CliDependencies, "admin" | "version" | "getPostgresSchemaSql">>
  & {
    io: CliIo
    getSqliteMigrationStatus?: CliDependencies["getSqliteMigrationStatus"]
    migrateSqliteDatabase?: CliDependencies["migrateSqliteDatabase"]
  }
