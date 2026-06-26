import { assertEquals } from "jsr:@std/assert"
import {
  getPostgresMigrations,
  getPostgresMigrationStatus,
  installPostgresSchema,
  migratePostgresDatabase,
} from "../src/postgres.ts"
import {
  getSqliteMigrations,
  getSqliteMigrationStatus,
  migrateSqliteDatabase,
} from "../src/sqlite.ts"
import { createFakePostgresClient } from "./fake_postgres.ts"

Deno.test("SQLite migrations use one linear initial schema migration", () => {
  const migrations = getSqliteMigrations()

  assertEquals(migrations.map((migration) => migration.version), ["001"])
  assertEquals(migrations[0].name, "initial_schema")
  assertEquals(
    migrations[0].statements.some((statement) => statement.includes("bare_crm_migrations")),
    false,
  )
})

Deno.test("SQLite migration status, dry-run, apply, and rerun are stable", () => {
  const path = Deno.makeTempFileSync({ suffix: ".db" })

  assertEquals(getSqliteMigrationStatus(path), {
    adapter: "sqlite",
    currentVersion: null,
    applied: [],
    pending: [{ version: "001", name: "initial_schema" }],
  })

  assertEquals(migrateSqliteDatabase(path, { dryRun: true }), {
    adapter: "sqlite",
    currentVersion: null,
    applied: [],
    pending: [{ version: "001", name: "initial_schema" }],
    appliedNow: [],
    dryRun: true,
  })

  const migrated = migrateSqliteDatabase(path, {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  })
  assertEquals(migrated.adapter, "sqlite")
  assertEquals(migrated.currentVersion, "001")
  assertEquals(migrated.applied, ["001"])
  assertEquals(migrated.pending, [])
  assertEquals(migrated.appliedNow, [{ version: "001", name: "initial_schema" }])
  assertEquals(migrated.dryRun, false)

  const rerun = migrateSqliteDatabase(path)
  assertEquals(rerun.currentVersion, "001")
  assertEquals(rerun.applied, ["001"])
  assertEquals(rerun.pending, [])
  assertEquals(rerun.appliedNow, [])
})

Deno.test("Postgres migrations use one linear initial schema migration", () => {
  const migrations = getPostgresMigrations()

  assertEquals(migrations.map((migration) => migration.version), ["001"])
  assertEquals(migrations[0].name, "initial_schema")
  assertEquals(
    migrations[0].statements.some((statement) => statement.includes("bare_crm_migrations")),
    true,
  )
})

Deno.test("Postgres migration status, dry-run, apply, and rerun are stable", async () => {
  const client = createFakePostgresClient()

  assertEquals(await getPostgresMigrationStatus(client), {
    adapter: "postgres",
    currentVersion: null,
    applied: [],
    pending: [{ version: "001", name: "initial_schema" }],
  })

  assertEquals(await migratePostgresDatabase(client, { dryRun: true }), {
    adapter: "postgres",
    currentVersion: null,
    applied: [],
    pending: [{ version: "001", name: "initial_schema" }],
    appliedNow: [],
    dryRun: true,
  })

  const migrated = await migratePostgresDatabase(client, {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  })
  assertEquals(migrated.adapter, "postgres")
  assertEquals(migrated.currentVersion, "001")
  assertEquals(migrated.applied, ["001"])
  assertEquals(migrated.pending, [])
  assertEquals(migrated.appliedNow, [{ version: "001", name: "initial_schema" }])
  assertEquals(migrated.dryRun, false)

  const rerun = await migratePostgresDatabase(client)
  assertEquals(rerun.currentVersion, "001")
  assertEquals(rerun.applied, ["001"])
  assertEquals(rerun.pending, [])
  assertEquals(rerun.appliedNow, [])
})

Deno.test("Postgres install schema records the initial migration", async () => {
  const client = createFakePostgresClient()

  await installPostgresSchema(client)

  assertEquals(await getPostgresMigrationStatus(client), {
    adapter: "postgres",
    currentVersion: "001",
    applied: ["001"],
    pending: [],
  })
})
