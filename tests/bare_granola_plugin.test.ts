import { assertEquals } from "jsr:@std/assert"
import { createCrmKernel, createExtensionHost, type CrmKernel } from "../src/index.ts"
import {
  bareGranolaPluginManifest,
  createBareGranolaRunner,
  createMemoryBareGranolaPluginStateStore,
  type GranolaNote,
  installBareGranolaPlugin,
  syncBareGranolaNotes,
} from "../src/adapters/granola/mod.ts"

const workspaceId = "workspace_1"

Deno.test("Bare Granola plugin manifest is valid and installable per workspace", () => {
  const { host } = setup()

  const state = installBareGranolaPlugin(host, { workspaceId })

  assertEquals(bareGranolaPluginManifest.id, "bare.granola")
  assertEquals(state.pluginId, "bare.granola")
  assertEquals(host.listCollectionProfiles({ workspaceId }).map((profile) => profile.id), [
    "granola.meeting-series",
  ])
})

Deno.test("Bare Granola runner saves meeting summaries as timeline activities and follow-up tasks", async () => {
  const { crm, host } = setup()
  installBareGranolaPlugin(host, { workspaceId })
  const company = await crm.write("company.create", {
    workspaceId,
    id: "company_acme",
    name: "Acme",
    domains: ["acme.com"],
  })
  const person = await crm.write("person.create", {
    workspaceId,
    id: "person_ada",
    name: "Ada Lovelace",
    emails: [{ value: "ada@acme.com", primary: true }],
  })
  const runner = createBareGranolaRunner({
    host,
    workspaceId,
    internalDomains: ["example.com"],
    createFollowUpTasks: true,
  })

  const result = await runner.processNote({ note: baseNote })

  assertEquals(result.action, "promoted")
  assertEquals(result.related, [
    { type: "person", id: person.id },
    { type: "company", id: company.id },
  ])
  assertEquals(result.activity?.status, "created")
  assertEquals(result.activity?.record.kind, "meeting")
  assertEquals(result.activity?.record.subject, "Acme renewal call")
  assertEquals(result.activity?.record.participants, [{ type: "person", id: person.id }])
  assertEquals(result.activity?.record.related, [
    { type: "person", id: person.id },
    { type: "company", id: company.id },
  ])
  assertEquals(result.activity?.record.externalRefs, [{
    system: "granola",
    id: "not_12345678901234",
    kind: "canonical",
  }])
  assertEquals(result.activity?.record.custom?.granola, {
    noteId: "not_12345678901234",
    calendarEventId: "event_acme_20260617",
    ownerEmail: "dan@example.com",
    transcriptStoredInKernel: false,
  })
  assertEquals(result.activity?.record.body?.includes("SOC2"), true)
  assertEquals(result.activity?.record.body?.includes("verbatim transcript"), false)
  assertEquals(result.tasks.length, 1)
  assertEquals(result.tasks[0].status, "created")
  assertEquals(result.tasks[0].record.title, "Send SOC2 packet to Ada")
  assertEquals(result.tasks[0].record.related?.[0], {
    type: "activity",
    id: result.activity?.record.id,
  })

  const timeline = await crm.read("timeline.list", {
    workspaceId,
    type: "person",
    id: person.id,
  })
  assertEquals(timeline.some((record) => record.type === "activity"), true)
  assertEquals(timeline.some((record) => record.type === "task"), true)
})

Deno.test("Bare Granola runner is idempotent for meeting activities and tasks", async () => {
  const { crm, host } = setup()
  installBareGranolaPlugin(host, { workspaceId })
  const runner = createBareGranolaRunner({
    host,
    workspaceId,
    internalDomains: ["example.com"],
    createFollowUpTasks: true,
  })

  const first = await runner.processNote({ note: baseNote })
  const second = await runner.processNote({ note: baseNote })

  assertEquals(first.activity?.status, "created")
  assertEquals(second.activity?.status, "matched")
  assertEquals(first.tasks[0].status, "created")
  assertEquals(second.tasks[0].status, "matched")
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Granola runner skips private and internal-only meetings by default", async () => {
  const { crm, host } = setup()
  installBareGranolaPlugin(host, { workspaceId })
  const runner = createBareGranolaRunner({
    host,
    workspaceId,
    internalDomains: ["example.com"],
  })

  const privateResult = await runner.processNote({
    note: {
      ...baseNote,
      id: "not_private123456",
      title: "Private 1:1",
      calendar_event: {
        ...baseNote.calendar_event,
        event_title: "Private 1:1",
      },
    },
  })
  const internalResult = await runner.processNote({
    note: {
      ...baseNote,
      id: "not_internal12345",
      title: "Weekly planning",
      attendees: [
        { name: "Dan", email: "dan@example.com" },
        { name: "Sam", email: "sam@example.com" },
      ],
      calendar_event: {
        ...baseNote.calendar_event,
        event_title: "Weekly planning",
        invitees: [{ email: "sam@example.com" }],
      },
    },
  })

  assertEquals(privateResult, {
    action: "skipped",
    skippedReason: "private",
    tasks: [],
    related: [],
  })
  assertEquals(internalResult, {
    action: "skipped",
    skippedReason: "internal_only",
    tasks: [],
    related: [],
  })
  assertEquals(await countRecords(crm, "activity"), 0)
  assertEquals(await countRecords(crm, "task"), 0)
})

Deno.test("Bare Granola sync polls notes and advances adapter-owned state after success", async () => {
  const { crm, host } = setup()
  installBareGranolaPlugin(host, { workspaceId })
  const state = createMemoryBareGranolaPluginStateStore()
  const client = {
    async listNotes() {
      return {
        notes: [{
          id: baseNote.id,
          object: "note" as const,
          title: baseNote.title,
          owner: baseNote.owner,
          created_at: baseNote.created_at,
          updated_at: baseNote.updated_at,
        }],
        hasMore: false,
        cursor: null,
      }
    },
    async getNote() {
      return baseNote
    },
  }

  const result = await syncBareGranolaNotes({
    host,
    workspaceId,
    client,
    state,
    internalDomains: ["example.com"],
    limit: 1,
  })

  assertEquals(result, {
    cursorBefore: null,
    cursorAfter: baseNote.updated_at,
    processed: 1,
    promoted: 1,
    skipped: 0,
    tasksCreated: 1,
  })
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(
    await state.getSyncState({
      workspaceId,
      pluginId: "bare.granola",
      syncId: "granola.note-sync",
    }),
    {
      updatedAfter: baseNote.updated_at,
      lastCursor: null,
    },
  )
})

const baseNote: GranolaNote = {
  id: "not_12345678901234",
  object: "note",
  title: "Acme renewal call",
  owner: { name: "Dan", email: "dan@example.com" },
  created_at: "2026-06-17T14:00:00Z",
  updated_at: "2026-06-17T15:00:00Z",
  web_url: "https://notes.granola.ai/d/acme-renewal",
  calendar_event: {
    event_title: "Acme renewal call",
    organiser: "dan@example.com",
    calendar_event_id: "event_acme_20260617",
    scheduled_start_time: "2026-06-17T14:00:00Z",
    scheduled_end_time: "2026-06-17T14:30:00Z",
    invitees: [{ email: "ada@acme.com" }],
  },
  attendees: [
    { name: "Dan", email: "dan@example.com" },
    { name: "Ada Lovelace", email: "ada@acme.com" },
  ],
  folder_membership: [{ id: "fol_12345678901234", object: "folder", name: "Customer calls" }],
  summary_text: "Acme discussed renewal, SOC2 requirements, and pricing.",
  summary_markdown:
    "## Summary\nAcme discussed renewal and SOC2 requirements.\n\n## Action Items\n- Send SOC2 packet to Ada",
  transcript: [{
    speaker: { source: "speaker" },
    text: "This is a verbatim transcript line that should not enter CRM records.",
  }],
}

function setup() {
  const crm = createCrmKernel({
    now: () => new Date("2026-06-17T16:00:00.000Z"),
    id: createDeterministicId(),
  })
  const host = createExtensionHost({
    crm,
    now: () => new Date("2026-06-17T16:00:00.000Z"),
  })
  return { crm, host }
}

async function countRecords(crm: CrmKernel, type: "activity" | "task"): Promise<number> {
  const records = await crm.read("record.search", { workspaceId, type, limit: 100 })
  return records.length
}

function createDeterministicId(): () => string {
  let next = 1
  return () => `id_${next++}`
}
