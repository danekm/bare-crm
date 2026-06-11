import { assertEquals, assertRejects } from "jsr:@std/assert"
import { createCrmKernel, CrmPolicyError } from "../src/index.ts"

Deno.test("creates and searches a person", async () => {
  const crm = createCrmKernel({
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    id: sequenceId(),
  })

  const person = await crm.command("person.create", {
    workspaceId: "workspace_1",
    name: "Ada Lovelace",
    emails: [{ value: "ada@example.com", primary: true }],
  })

  assertEquals(person.id, "id_1")
  assertEquals(person.version, 1)

  const results = await crm.query("record.search", {
    workspaceId: "workspace_1",
    type: "person",
    text: "lovelace",
  })

  assertEquals(results, [person])
})

Deno.test("policies can block commands without becoming kernel invariants", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

  crm.policy({
    id: "deal-company-required",
    appliesTo: ["deal.create"],
    mode: "blocking",
    evaluate({ input }) {
      if (typeof input === "object" && input && !("companyId" in input)) {
        return {
          ok: false,
          code: "deal.company_required",
          message: "Deals in this workspace require a company.",
          field: "companyId",
        }
      }
      return { ok: true }
    },
  })

  await assertRejects(
    () =>
      crm.command("deal.create", {
        workspaceId: "workspace_1",
        name: "Pilot",
        stage: "new",
        status: "open",
      }),
    CrmPolicyError,
    "Deals in this workspace require a company.",
  )
})

Deno.test("workflows react to committed events through commands", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

  crm.workflow({
    id: "meeting-follow-up",
    trigger: "activity.created",
    async run({ event, crm }) {
      if (event.record.type !== "activity" || event.record.kind !== "meeting") return

      await crm.command("task.create", {
        workspaceId: event.workspaceId,
        title: "Send follow-up",
        status: "todo",
        related: [{ type: "activity", id: event.record.id }],
      })
    },
  })

  const activity = await crm.command("activity.create", {
    workspaceId: "workspace_1",
    kind: "meeting",
    occurredAt: "2026-01-01T00:00:00.000Z",
    subject: "Intro",
  })

  const timeline = await crm.query("timeline.list", {
    workspaceId: "workspace_1",
    type: "activity",
    id: activity.id,
  })

  assertEquals(timeline.length, 2)
})

Deno.test("relations require existing endpoints", async () => {
  const crm = createCrmKernel({ id: sequenceId() })

  await assertRejects(() =>
    crm.command("relation.create", {
      workspaceId: "workspace_1",
      from: { type: "person", id: "missing_person" },
      to: { type: "company", id: "missing_company" },
      kind: "works_at",
    })
  )
})

function sequenceId(): () => string {
  let count = 0
  return () => `id_${++count}`
}
