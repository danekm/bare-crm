import { assertEquals, assertRejects } from "jsr:@std/assert"
import {
  createCrmKernel,
  createMemoryStorage,
  CrmKernelError,
  type CrmKernelOptions,
  CrmNotFoundError,
  CrmPermissionError,
  type StorageApi,
  StorageConflictError,
} from "../src/index.ts"
import { createSqliteMemoryStorage } from "../src/sqlite.ts"
import { createFakePostgresStorage } from "./fake_postgres.ts"

type CloseableStorage = StorageApi & { close?: () => void }

const kernelScenarios: Array<{ name: string; createStorage: () => CloseableStorage }> = [
  { name: "memory", createStorage: createMemoryStorage },
  { name: "SQLite", createStorage: createSqliteMemoryStorage },
  { name: "Postgres", createStorage: createFakePostgresStorage },
]

for (const scenario of kernelScenarios) {
  Deno.test(`${scenario.name}: Write API creates records and Read API searches them`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        name: "Ada Lovelace",
        emails: [{ value: "ada@example.com", primary: true }],
      })

      assertEquals(person.id, "id_2")
      assertEquals(person.version, 1)
      assertEquals(person.source, "manual")

      const results = await crm.read("record.search", {
        workspaceId: "workspace_1",
        type: "person",
        text: "lovelace",
      })

      assertEquals(results, [person])
    })
  })

  Deno.test(`${scenario.name}: all core entity create writes produce records`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
      })
      const company = await crm.write("company.create", {
        workspaceId: "workspace_1",
        id: "company_1",
        name: "Analytical Engines Ltd",
      })
      const deal = await crm.write("deal.create", {
        workspaceId: "workspace_1",
        id: "deal_1",
        name: "Difference Engine rollout",
        stage: "qualified",
        status: "open",
      })
      const collection = await crm.write("collection.create", {
        workspaceId: "workspace_1",
        id: "collection_1",
        title: "Difference Engine rollout context",
        kind: "sales.rollout",
        status: "open",
        related: [{ type: "deal", id: deal.id }],
      })
      const activity = await crm.write("activity.create", {
        workspaceId: "workspace_1",
        id: "activity_1",
        kind: "meeting",
        occurredAt: "2026-01-02T00:00:00.000Z",
      })
      const note = await crm.write("note.create", {
        workspaceId: "workspace_1",
        id: "note_1",
        body: "Very promising.",
        related: [{ type: "deal", id: deal.id }],
      })
      const task = await crm.write("task.create", {
        workspaceId: "workspace_1",
        id: "task_1",
        title: "Send proposal",
        status: "todo",
      })
      const file = await crm.write("file.create", {
        workspaceId: "workspace_1",
        id: "file_1",
        filename: "proposal.pdf",
        mimeType: "application/pdf",
        size: 12,
        storageKey: "files/proposal.pdf",
      })
      const relation = await crm.write("relation.create", {
        workspaceId: "workspace_1",
        id: "relation_1",
        from: { type: "person", id: person.id },
        to: { type: "company", id: company.id },
        kind: "works_at",
      })

      assertEquals(
        [person, company, deal, collection, activity, note, task, file, relation].map((record) =>
          record.type
        ),
        [
          "person",
          "company",
          "deal",
          "collection",
          "activity",
          "note",
          "task",
          "file",
          "relation",
        ],
      )
      assertEquals(
        await crm.read("record.get", {
          workspaceId: "workspace_1",
          type: "file",
          id: "file_1",
        }),
        file,
      )
    })
  })

  Deno.test(`${scenario.name}: Event Log records successful Write API operations`, async () => {
    await withKernel(scenario, async (crm) => {
      const company = await crm.write(
        "company.create",
        {
          workspaceId: "workspace_1",
          name: "Analytical Engines Ltd",
        },
        {
          context: {
            workspaceId: "workspace_1",
            actor: { type: "human", id: "user_1", displayName: "Ada" },
            causationId: "event_import_started",
            correlationId: "corr_1",
          },
          idempotencyKey: "import:companies:1",
        },
      )

      const events = await crm.read("event.list", {
        workspaceId: "workspace_1",
      })

      assertEquals(events.length, 1)
      assertEquals(events[0].schemaVersion, 1)
      assertEquals(events[0].name, "company.created")
      assertEquals(events[0].operation, "company.create")
      assertEquals(events[0].recordRef, { type: "company", id: company.id })
      assertEquals(events[0].recordVersion, company.version)
      assertEquals(events[0].record, company)
      assertEquals(events[0].source, "manual")
      assertEquals(events[0].actorType, "human")
      assertEquals(events[0].actorId, "user_1")
      assertEquals(events[0].actorDisplayName, "Ada")
      assertEquals(events[0].causationId, "event_import_started")
      assertEquals(events[0].correlationId, "corr_1")
      assertEquals(events[0].idempotencyKey, "import:companies:1")
    })
  })

  Deno.test(`${scenario.name}: update preserves identity and increments version`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
        tags: ["lead"],
      })

      const updated = await crm.write("record.update", {
        workspaceId: "workspace_1",
        ref: { type: "person", id: person.id },
        patch: {
          name: "Ada Byron",
          tags: ["lead", "vip"],
        },
      })

      assertEquals(updated.id, person.id)
      assertEquals(updated.type, "person")
      assertEquals(updated.workspaceId, "workspace_1")
      assertEquals(updated.createdAt, person.createdAt)
      assertEquals(updated.version, 2)
      if (updated.type !== "person") throw new Error("Expected person update result")
      assertEquals(updated.name, "Ada Byron")
      assertEquals(updated.tags, ["lead", "vip"])

      const events = await crm.read("event.list", { workspaceId: "workspace_1" })
      assertEquals(events.map((event) => event.name), ["person.created", "person.updated"])
    })
  })

  Deno.test(`${scenario.name}: duplicate create IDs are rejected`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("company.create", {
        workspaceId: "workspace_1",
        id: "company_1",
        name: "First Company",
      })

      await assertRejects(
        () =>
          crm.write("company.create", {
            workspaceId: "workspace_1",
            id: "company_1",
            name: "Second Company",
          }),
        StorageConflictError,
      )

      const results = await crm.read("record.search", {
        workspaceId: "workspace_1",
        type: "company",
        includeArchived: true,
      })
      assertEquals(
        results.map((record) => {
          if (record.type !== "company") throw new Error("Expected company search result")
          return record.name
        }),
        ["First Company"],
      )
    })
  })

  Deno.test(`${scenario.name}: relations require existing endpoints and can be listed`, async () => {
    await withKernel(scenario, async (crm) => {
      await assertRejects(() =>
        crm.write("relation.create", {
          workspaceId: "workspace_1",
          from: { type: "person", id: "missing_person" },
          to: { type: "company", id: "missing_company" },
          kind: "works_at",
        }), CrmNotFoundError)

      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        name: "Ada Lovelace",
      })
      const company = await crm.write("company.create", {
        workspaceId: "workspace_1",
        name: "Analytical Engines Ltd",
      })

      const relation = await crm.write("relation.create", {
        workspaceId: "workspace_1",
        from: { type: "person", id: person.id },
        to: { type: "company", id: company.id },
        kind: "works_at",
      })

      const personRelations = await crm.read("relation.list", {
        workspaceId: "workspace_1",
        type: "person",
        id: person.id,
      })
      const companyRelations = await crm.read("relation.list", {
        workspaceId: "workspace_1",
        type: "company",
        id: company.id,
      })

      assertEquals(personRelations, [relation])
      assertEquals(companyRelations, [relation])
    })
  })

  Deno.test(`${scenario.name}: relation validation is scoped to the input workspace`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
      })
      const company = await crm.write("company.create", {
        workspaceId: "workspace_2",
        id: "company_1",
        name: "Analytical Engines Ltd",
      })

      await assertRejects(
        () =>
          crm.write("relation.create", {
            workspaceId: "workspace_1",
            from: { type: "person", id: person.id },
            to: { type: "company", id: company.id },
            kind: "works_at",
          }),
        CrmNotFoundError,
      )
    })
  })

  Deno.test(`${scenario.name}: archive hides records from default reads`, async () => {
    await withKernel(scenario, async (crm) => {
      const task = await crm.write("task.create", {
        workspaceId: "workspace_1",
        title: "Follow up",
        status: "todo",
      })

      await crm.write("record.archive", {
        workspaceId: "workspace_1",
        ref: { type: "task", id: task.id },
      })

      const visible = await crm.read("record.search", {
        workspaceId: "workspace_1",
        type: "task",
      })
      const archived = await crm.read("record.search", {
        workspaceId: "workspace_1",
        type: "task",
        includeArchived: true,
      })

      assertEquals(visible, [])
      assertEquals(archived.length, 1)
      assertEquals(archived[0].archivedAt !== undefined, true)
    })
  })

  Deno.test(`${scenario.name}: archived relations are hidden unless requested`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        name: "Ada Lovelace",
      })
      const company = await crm.write("company.create", {
        workspaceId: "workspace_1",
        name: "Analytical Engines Ltd",
      })
      const relation = await crm.write("relation.create", {
        workspaceId: "workspace_1",
        from: { type: "person", id: person.id },
        to: { type: "company", id: company.id },
        kind: "works_at",
      })

      await crm.write("record.archive", {
        workspaceId: "workspace_1",
        ref: { type: "relation", id: relation.id },
      })

      assertEquals(
        await crm.read("relation.list", {
          workspaceId: "workspace_1",
          type: "person",
          id: person.id,
        }),
        [],
      )
      assertEquals(
        (await crm.read("relation.list", {
          workspaceId: "workspace_1",
          type: "person",
          id: person.id,
          includeArchived: true,
        })).length,
        1,
      )
    })
  })

  Deno.test(`${scenario.name}: timeline lists records directly related to a record`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
      })
      const unrelated = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_2",
        name: "Grace Hopper",
      })
      const activity = await crm.write("activity.create", {
        workspaceId: "workspace_1",
        id: "activity_1",
        kind: "call",
        occurredAt: "2026-01-02T00:00:00.000Z",
        participants: [{ type: "person", id: person.id }],
      })
      const note = await crm.write("note.create", {
        workspaceId: "workspace_1",
        id: "note_1",
        body: "Asked for details.",
        related: [{ type: "person", id: person.id }],
      })

      const timeline = await crm.read("timeline.list", {
        workspaceId: "workspace_1",
        type: "person",
        id: person.id,
      })

      assertEquals(timeline.some((record) => record.id === person.id), true)
      assertEquals(timeline.some((record) => record.id === activity.id), true)
      assertEquals(timeline.some((record) => record.id === note.id), true)
      assertEquals(timeline.some((record) => record.id === unrelated.id), false)
    })
  })

  Deno.test(`${scenario.name}: collections group related records without owning profile logic`, async () => {
    await withKernel(scenario, async (crm) => {
      await assertRejects(
        () =>
          crm.write("collection.create", {
            workspaceId: "workspace_1",
            title: "Missing members",
            kind: "gmail.thread",
            related: [{ type: "activity", id: "missing_activity" }],
          }),
        CrmNotFoundError,
      )

      const activity = await crm.write("activity.create", {
        workspaceId: "workspace_1",
        id: "activity_1",
        kind: "email",
        subject: "Renewal pricing",
        occurredAt: "2026-01-02T00:00:00.000Z",
      })
      const note = await crm.write("note.create", {
        workspaceId: "workspace_1",
        id: "note_1",
        body: "Customer asked for renewal terms.",
        related: [{ type: "activity", id: activity.id }],
      })
      const unrelated = await crm.write("task.create", {
        workspaceId: "workspace_1",
        id: "task_1",
        title: "Unrelated follow-up",
        status: "todo",
      })
      const collection = await crm.write("collection.create", {
        workspaceId: "workspace_1",
        id: "collection_1",
        title: "Acme renewal discussion",
        kind: "sales.renewal",
        status: "open",
        related: [
          { type: "activity", id: activity.id },
          { type: "note", id: note.id },
        ],
        outcome: {
          code: "pending",
          summary: "Waiting on pricing approval.",
          related: [{ type: "activity", id: activity.id }],
        },
      })

      const timeline = await crm.read("timeline.list", {
        workspaceId: "workspace_1",
        type: "collection",
        id: collection.id,
      })

      assertEquals(timeline.some((record) => record.id === collection.id), true)
      assertEquals(timeline.some((record) => record.id === activity.id), true)
      assertEquals(timeline.some((record) => record.id === note.id), true)
      assertEquals(timeline.some((record) => record.id === unrelated.id), false)

      const activityTimeline = await crm.read("timeline.list", {
        workspaceId: "workspace_1",
        type: "activity",
        id: activity.id,
      })

      assertEquals(activityTimeline.some((record) => record.id === collection.id), true)
    })
  })

  Deno.test(`${scenario.name}: search filters are workspace isolated`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
      })
      await crm.write("person.create", {
        workspaceId: "workspace_2",
        id: "person_1",
        name: "Ada Lovelace",
      })

      assertEquals(
        await crm.read("record.get", {
          workspaceId: "workspace_2",
          type: "person",
          id: "person_1",
        }),
        {
          id: "person_1",
          type: "person",
          workspaceId: "workspace_2",
          name: "Ada Lovelace",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          source: "manual",
          version: 1,
        },
      )
      assertEquals(
        (await crm.read("record.search", {
          workspaceId: "workspace_1",
          type: "person",
          text: "ada",
        })).map((record) => record.workspaceId),
        ["workspace_1"],
      )
    })
  })

  Deno.test(`${scenario.name}: search filters by tags, owner, source, and external reference`, async () => {
    await withKernel(scenario, async (crm) => {
      const target = await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
        ownerId: "user_1",
        source: "import",
        tags: ["vip", "newsletter"],
        externalRefs: [{ system: "hubspot", id: "hs_1" }],
      })
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_2",
        name: "Grace Hopper",
        ownerId: "user_2",
        source: "manual",
        tags: ["newsletter"],
        externalRefs: [{ system: "hubspot", id: "hs_2" }],
      })

      assertEquals(
        await crm.read("record.search", {
          workspaceId: "workspace_1",
          type: "person",
          ownerId: "user_1",
          source: "import",
          tags: ["vip"],
          externalRef: { system: "hubspot", id: "hs_1" },
        }),
        [target],
      )
    })
  })

  Deno.test(`${scenario.name}: event listing is workspace scoped and limit aware`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
      })
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_2",
        name: "Grace Hopper",
      })
      await crm.write("person.create", {
        workspaceId: "workspace_2",
        id: "person_3",
        name: "Katherine Johnson",
      })

      const events = await crm.read("event.list", {
        workspaceId: "workspace_1",
        limit: 1,
      })

      assertEquals(events.length, 1)
      assertEquals(events[0].record.id, "person_2")
      assertEquals(events[0].workspaceId, "workspace_1")
    })
  })

  Deno.test(`${scenario.name}: event listing filters by audit fields`, async () => {
    await withKernel(scenario, async (crm) => {
      const person = await crm.write(
        "person.create",
        {
          workspaceId: "workspace_1",
          id: "person_1",
          name: "Ada Lovelace",
          source: "import",
        },
        {
          context: {
            workspaceId: "workspace_1",
            actor: { type: "sync", id: "gmail_sync" },
            causationId: "gmail_message_1",
            correlationId: "gmail_thread_1",
          },
          idempotencyKey: "gmail:message:1",
        },
      )
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_2",
        name: "Grace Hopper",
      })

      assertEquals(
        await crm.read("event.list", {
          workspaceId: "workspace_1",
          name: "person.created",
          record: { type: "person", id: person.id },
          source: "import",
          actorId: "gmail_sync",
          causationId: "gmail_message_1",
          correlationId: "gmail_thread_1",
          idempotencyKey: "gmail:message:1",
        }),
        [{
          id: "id_2",
          schemaVersion: 1,
          workspaceId: "workspace_1",
          name: "person.created",
          operation: "person.create",
          recordRef: { type: "person", id: "person_1" },
          recordVersion: 1,
          record: person,
          occurredAt: "2026-01-01T00:00:00.000Z",
          writeId: "id_1",
          source: "import",
          actorType: "sync",
          actorId: "gmail_sync",
          causationId: "gmail_message_1",
          correlationId: "gmail_thread_1",
          idempotencyKey: "gmail:message:1",
        }],
      )

      const [event] = await crm.read("event.list", {
        workspaceId: "workspace_1",
        writeId: "id_1",
      })
      assertEquals(event.recordRef, { type: "person", id: "person_1" })
    })
  })

  Deno.test(`${scenario.name}: workspace context must match write input`, async () => {
    await withKernel(scenario, async (crm) => {
      await assertRejects(
        () =>
          crm.write(
            "person.create",
            {
              workspaceId: "workspace_1",
              name: "Ada Lovelace",
            },
            {
              context: {
                workspaceId: "workspace_2",
                actor: { type: "agent", id: "agent_1" },
              },
            },
          ),
        CrmKernelError,
        "workspaceId does not match",
      )
    })
  })

  Deno.test(`${scenario.name}: read workspace context must match read input`, async () => {
    await withKernel(scenario, async (crm) => {
      await crm.write("person.create", {
        workspaceId: "workspace_1",
        id: "person_1",
        name: "Ada Lovelace",
      })

      await assertRejects(
        () =>
          crm.read(
            "record.get",
            { workspaceId: "workspace_1", type: "person", id: "person_1" },
            { context: { workspaceId: "workspace_2" } },
          ),
        CrmKernelError,
        "workspaceId does not match",
      )
    })
  })

  Deno.test(`${scenario.name}: strict capability mode requires context and actor`, async () => {
    await withKernel(
      scenario,
      async (crm) => {
        await assertRejects(
          () =>
            crm.write("person.create", {
              workspaceId: "workspace_1",
              name: "Ada Lovelace",
            }),
          CrmPermissionError,
          "requires an execution context",
        )

        await assertRejects(
          () =>
            crm.write(
              "person.create",
              {
                workspaceId: "workspace_1",
                name: "Ada Lovelace",
              },
              {
                context: {
                  workspaceId: "workspace_1",
                  capabilities: ["crm:write:person.create"],
                },
              },
            ),
          CrmPermissionError,
          "requires an actor",
        )

        await assertRejects(
          () => crm.read("record.search", { workspaceId: "workspace_1" }),
          CrmPermissionError,
          "requires an execution context",
        )
      },
      { enforceCapabilities: true },
    )
  })

  Deno.test(`${scenario.name}: strict capability mode enforces write and read capabilities`, async () => {
    await withKernel(
      scenario,
      async (crm) => {
        await assertRejects(
          () =>
            crm.write(
              "person.create",
              {
                workspaceId: "workspace_1",
                name: "Ada Lovelace",
              },
              {
                context: {
                  workspaceId: "workspace_1",
                  actor: { type: "agent", id: "agent_1" },
                  capabilities: ["crm:read"],
                },
              },
            ),
          CrmPermissionError,
          "crm:write:person.create",
        )

        const person = await crm.write(
          "person.create",
          {
            workspaceId: "workspace_1",
            id: "person_1",
            name: "Ada Lovelace",
          },
          {
            context: {
              workspaceId: "workspace_1",
              actor: { type: "agent", id: "agent_1" },
              capabilities: ["crm:write:person.create"],
            },
          },
        )

        await assertRejects(
          () =>
            crm.read(
              "record.get",
              { workspaceId: "workspace_1", type: "person", id: person.id },
              {
                context: {
                  workspaceId: "workspace_1",
                  actor: { type: "agent", id: "agent_1" },
                  capabilities: ["crm:write"],
                },
              },
            ),
          CrmPermissionError,
          "crm:read:record.get",
        )

        assertEquals(
          await crm.read(
            "record.get",
            { workspaceId: "workspace_1", type: "person", id: person.id },
            {
              context: {
                workspaceId: "workspace_1",
                actor: { type: "agent", id: "agent_1" },
                capabilities: ["crm:read:record.get"],
              },
            },
          ),
          person,
        )
      },
      { enforceCapabilities: true },
    )
  })

  Deno.test(`${scenario.name}: strict capability mode supports broad capabilities`, async () => {
    await withKernel(
      scenario,
      async (crm) => {
        const adminContext = {
          workspaceId: "workspace_1",
          actor: { type: "system" as const, id: "system_1" },
          capabilities: ["crm:*" as const],
        }

        const person = await crm.write(
          "person.create",
          {
            workspaceId: "workspace_1",
            name: "Ada Lovelace",
          },
          { context: adminContext },
        )

        assertEquals(
          await crm.read(
            "record.get",
            { workspaceId: "workspace_1", type: "person", id: person.id },
            { context: adminContext },
          ),
          person,
        )
      },
      { enforceCapabilities: true },
    )
  })

  Deno.test(`${scenario.name}: idempotency keys return the original write result`, async () => {
    await withKernel(scenario, async (crm) => {
      const first = await crm.write(
        "person.create",
        {
          workspaceId: "workspace_1",
          name: "Ada Lovelace",
        },
        { idempotencyKey: "csv:row:1" },
      )
      const second = await crm.write(
        "person.create",
        {
          workspaceId: "workspace_1",
          name: "Ada Byron",
        },
        { idempotencyKey: "csv:row:1" },
      )

      const events = await crm.read("event.list", { workspaceId: "workspace_1" })

      assertEquals(second, first)
      assertEquals(events.length, 1)
    })
  })

  Deno.test(`${scenario.name}: idempotency keys are scoped by workspace and write name`, async () => {
    await withKernel(scenario, async (crm) => {
      const workspaceOnePerson = await crm.write(
        "person.create",
        {
          workspaceId: "workspace_1",
          name: "Ada Lovelace",
        },
        { idempotencyKey: "same-key" },
      )
      const workspaceTwoPerson = await crm.write(
        "person.create",
        {
          workspaceId: "workspace_2",
          name: "Ada Lovelace",
        },
        { idempotencyKey: "same-key" },
      )
      const workspaceOneCompany = await crm.write(
        "company.create",
        {
          workspaceId: "workspace_1",
          name: "Analytical Engines Ltd",
        },
        { idempotencyKey: "same-key" },
      )

      assertEquals(workspaceOnePerson.workspaceId, "workspace_1")
      assertEquals(workspaceTwoPerson.workspaceId, "workspace_2")
      assertEquals(workspaceOneCompany.type, "company")
      assertEquals(workspaceOnePerson.id === workspaceTwoPerson.id, false)
    })
  })
}

async function withKernel(
  scenario: { createStorage: () => CloseableStorage },
  fn: (crm: ReturnType<typeof createCrmKernel>) => Promise<void>,
  options: Pick<CrmKernelOptions, "enforceCapabilities"> = {},
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
