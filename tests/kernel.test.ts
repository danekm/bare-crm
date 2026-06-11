import { assertEquals, assertRejects } from "jsr:@std/assert"
import { createCrmKernel, CrmKernelError, CrmNotFoundError } from "../src/index.ts"

Deno.test("Write API creates records and Read API searches them", async () => {
  const crm = createCrmKernel({
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: sequenceId(),
  })

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

Deno.test("Event Log records successful Write API operations", async () => {
  const crm = createCrmKernel({
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: sequenceId(),
  })

  const company = await crm.write(
    "company.create",
    {
      workspaceId: "workspace_1",
      name: "Analytical Engines Ltd",
    },
    {
      context: {
        workspaceId: "workspace_1",
        actor: { type: "human", id: "user_1" },
        correlationId: "corr_1",
      },
      idempotencyKey: "import:companies:1",
    },
  )

  const events = await crm.read("event.list", {
    workspaceId: "workspace_1",
  })

  assertEquals(events.length, 1)
  assertEquals(events[0].name, "company.created")
  assertEquals(events[0].record, company)
  assertEquals(events[0].actorId, "user_1")
  assertEquals(events[0].correlationId, "corr_1")
  assertEquals(events[0].idempotencyKey, "import:companies:1")
})

Deno.test("relations require existing endpoints and can be listed", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

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

  const relations = await crm.read("relation.list", {
    workspaceId: "workspace_1",
    type: "person",
    id: person.id,
  })

  assertEquals(relations, [relation])
})

Deno.test("archive hides records from default reads", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

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

Deno.test("workspace context must match write input", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

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

Deno.test("idempotency keys return the original write result", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

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

function sequenceId(): () => string {
  let count = 0
  return () => `id_${++count}`
}
