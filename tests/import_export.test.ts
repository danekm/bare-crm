import { assertEquals, assertRejects } from "jsr:@std/assert"
import {
  createCrmKernel,
  createMemoryStorage,
  exportJsonLines,
  exportRecords,
  findByExternalRef,
  importByExternalRef,
  ImportExportError,
  type StorageApi,
} from "../src/index.ts"
import { createSqliteMemoryStorage } from "../src/sqlite.ts"
import { createFakePostgresStorage } from "./fake_postgres.ts"

type CloseableStorage = StorageApi & { close?: () => void }

const scenarios: Array<{ name: string; createStorage: () => CloseableStorage }> = [
  { name: "memory", createStorage: createMemoryStorage },
  { name: "SQLite", createStorage: createSqliteMemoryStorage },
  { name: "Postgres", createStorage: createFakePostgresStorage },
]

for (const scenario of scenarios) {
  Deno.test(`${scenario.name}: import creates then matches by external reference`, async () => {
    await withCrm(scenario, async (crm) => {
      const externalRef = { system: "hubspot", id: "contact_1" }

      const created = await importByExternalRef(crm, {
        write: "person.create",
        input: {
          workspaceId: "workspace_1",
          name: "Ada Lovelace",
        },
        externalRef,
      })
      const matched = await importByExternalRef(crm, {
        write: "person.create",
        input: {
          workspaceId: "workspace_1",
          name: "Ada Byron",
        },
        externalRef,
      })

      assertEquals(created.status, "created")
      if (created.status !== "created") throw new Error("Expected created import")
      assertEquals(created.record.source, "import")
      assertEquals(created.record.externalRefs, [{
        system: "hubspot",
        id: "contact_1",
        kind: "source",
      }])
      assertEquals(matched.status, "matched")
      if (matched.status !== "matched") throw new Error("Expected matched import")
      assertEquals(matched.record, created.record)
      assertEquals(
        await crm.read("record.search", {
          workspaceId: "workspace_1",
          type: "person",
          externalRef,
        }),
        [created.record],
      )
    })
  })

  Deno.test(`${scenario.name}: import update mode patches existing record`, async () => {
    await withCrm(scenario, async (crm) => {
      const externalRef = { system: "hubspot", id: "contact_1" }

      await importByExternalRef(crm, {
        write: "person.create",
        input: {
          workspaceId: "workspace_1",
          name: "Ada Lovelace",
        },
        externalRef,
      })
      const updated = await importByExternalRef(crm, {
        write: "person.create",
        input: {
          workspaceId: "workspace_1",
          name: "Ada Ignored",
        },
        externalRef,
        mode: "update",
        updatePatch: {
          name: "Ada Byron",
        },
      })

      assertEquals(updated.status, "updated")
      if (updated.status !== "updated") throw new Error("Expected updated import")
      assertEquals(updated.record.version, 2)
      if (updated.record.type !== "person") throw new Error("Expected person")
      assertEquals(updated.record.name, "Ada Byron")
      assertEquals(updated.record.externalRefs?.length, 1)
    })
  })

  Deno.test(`${scenario.name}: dry-run import returns intent without writing`, async () => {
    await withCrm(scenario, async (crm) => {
      const dryRun = await importByExternalRef(crm, {
        write: "person.create",
        input: {
          workspaceId: "workspace_1",
          name: "Ada Lovelace",
        },
        externalRef: { system: "csv", id: "row_1" },
        dryRun: true,
      })

      assertEquals(dryRun.status, "dry_run")
      if (dryRun.status !== "dry_run") throw new Error("Expected dry run")
      assertEquals(dryRun.would, "create")
      assertEquals(
        await crm.read("record.search", { workspaceId: "workspace_1" }),
        [],
      )
    })
  })

  Deno.test(`${scenario.name}: external reference lookup detects ambiguity`, async () => {
    await withCrm(scenario, async (crm) => {
      const externalRef = { system: "legacy", id: "shared_1" }

      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
        externalRefs: [externalRef],
      })
      await crm.write("company.create", {
        workspaceId: "workspace_1",
        id: "company_1",
        name: "Analytical Engines Ltd",
        externalRefs: [externalRef],
      })

      await assertRejects(
        () =>
          findByExternalRef(crm, {
            workspaceId: "workspace_1",
            externalRef,
          }),
        ImportExportError,
        "matched multiple records",
      )
    })
  })

  Deno.test(`${scenario.name}: export uses Read API and emits JSON Lines`, async () => {
    await withCrm(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
        externalRefs: [{ system: "hubspot", id: "contact_1" }],
      })
      const company = await crm.write("company.create", {
        workspaceId: "workspace_1",
        id: "company_1",
        name: "Analytical Engines Ltd",
      })
      const relation = await crm.write("relation.create", {
        workspaceId: "workspace_1",
        id: "relation_1",
        from: { type: "person", id: person.id },
        to: { type: "company", id: company.id },
        kind: "works_at",
      })

      assertEquals(
        await exportRecords(crm, {
          workspaceId: "workspace_1",
          type: "person",
          includeRelations: true,
        }),
        [person, relation],
      )

      const lines = (await exportJsonLines(crm, {
        workspaceId: "workspace_1",
        type: "person",
        includeRelations: true,
      })).trimEnd().split("\n").map((line) => JSON.parse(line))

      assertEquals(lines, [
        { kind: "record", schemaVersion: 1, record: person },
        { kind: "record", schemaVersion: 1, record: relation },
      ])
    })
  })

  Deno.test(`${scenario.name}: import helpers work in strict capability mode`, async () => {
    await withCrm(
      scenario,
      async (crm) => {
        const result = await importByExternalRef(
          crm,
          {
            write: "person.create",
            input: {
              workspaceId: "workspace_1",
              name: "Ada Lovelace",
            },
            externalRef: { system: "gmail", id: "contact_1" },
          },
          {
            context: {
              workspaceId: "workspace_1",
              actor: { type: "sync", id: "gmail_sync" },
              capabilities: ["crm:read:record.search", "crm:write:person.create"],
            },
          },
        )

        assertEquals(result.status, "created")
      },
      { enforceCapabilities: true },
    )
  })
}

async function withCrm(
  scenario: { createStorage: () => CloseableStorage },
  fn: (crm: ReturnType<typeof createCrmKernel>) => Promise<void>,
  options: { enforceCapabilities?: boolean } = {},
): Promise<void> {
  const storage = scenario.createStorage()
  try {
    const crm = createCrmKernel({
      storage,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      id: sequenceId(),
      enforceCapabilities: options.enforceCapabilities,
    })
    await fn(crm)
  } finally {
    storage.close?.()
  }
}

function sequenceId(): () => string {
  let count = 0
  return () => `id_${++count}`
}
