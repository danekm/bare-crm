import { assertEquals } from "jsr:@std/assert"
import {
  classifyGmailMessage,
  createCrmKernel,
  createExtensionHost,
  type CrmKernel,
  type EntityType,
  type GmailMessageSnapshot,
} from "../src/index.ts"
import {
  createMemoryBareGmailPreferenceStore,
  createMemoryBareGmailReviewStore,
  handleBareGmailReviewAction,
  installBareGmailPlugin,
  queueBareGmailReviewItem,
} from "../src/adapters/gmail/mod.ts"

const workspaceId = "workspace_1"

const suggestedMessage: GmailMessageSnapshot = {
  id: "support_1",
  threadId: "support_thread",
  historyId: "hist_1",
  subject: "Support issue",
  snippet: "We are blocked by a bug.",
  from: { email: "newlead@unknown.test", name: "New Lead" },
  to: [{ email: "sales@example.com" }],
  date: "2026-01-02T00:00:00.000Z",
}

Deno.test("Bare Gmail review queue keeps suggested messages outside kernel records", async () => {
  const { crm } = setup()
  const store = createMemoryBareGmailReviewStore()
  const classification = classifyGmailMessage(suggestedMessage)

  const item = await queueBareGmailReviewItem({
    store,
    workspaceId,
    message: suggestedMessage,
    classification,
    now: fixedNow,
  })

  assertEquals(classification.bucket, "suggest")
  assertEquals(item?.id, "gmail-review:support_1")
  assertEquals((await store.list({ workspaceId, status: "open" })).length, 1)
  assertEquals(await countRecords(crm, "activity"), 0)
  assertEquals(await countRecords(crm, "task"), 0)
})

Deno.test("Bare Gmail review actions save suggested messages after confirmation", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const preferences = createMemoryBareGmailPreferenceStore()
  const classification = classifyGmailMessage(suggestedMessage)

  const result = await handleBareGmailReviewAction({
    host,
    workspaceId,
    message: suggestedMessage,
    actionId: "gmail.save_activity",
    classification,
    preferences,
  })

  assertEquals(result.status, "processed")
  assertEquals(result.processResult?.activity?.status, "created")
  assertEquals(result.processResult?.task, undefined)
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 0)
})

Deno.test("Bare Gmail review follow-up action creates an idempotent task", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const preferences = createMemoryBareGmailPreferenceStore()
  const classification = classifyGmailMessage(suggestedMessage)

  const first = await handleBareGmailReviewAction({
    host,
    workspaceId,
    message: suggestedMessage,
    actionId: "gmail.create_follow_up",
    classification,
    preferences,
  })
  const second = await handleBareGmailReviewAction({
    host,
    workspaceId,
    message: suggestedMessage,
    actionId: "gmail.create_follow_up",
    classification,
    preferences,
  })

  assertEquals(first.processResult?.task?.status, "created")
  assertEquals(second.processResult?.task?.status, "matched")
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Gmail review create lead action writes lead records through the host", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const preferences = createMemoryBareGmailPreferenceStore()

  const first = await handleBareGmailReviewAction({
    host,
    workspaceId,
    message: suggestedMessage,
    actionId: "gmail.create_lead",
    preferences,
  })
  const second = await handleBareGmailReviewAction({
    host,
    workspaceId,
    message: suggestedMessage,
    actionId: "gmail.create_lead",
    preferences,
  })

  assertEquals(first.lead?.person.status, "created")
  assertEquals(first.lead?.company?.status, "created")
  assertEquals(first.lead?.relation?.status, "created")
  assertEquals(second.lead?.person.status, "matched")
  assertEquals(second.lead?.company?.status, "matched")
  assertEquals(second.lead?.relation?.status, "matched")
  assertEquals(await countRecords(crm, "person"), 1)
  assertEquals(await countRecords(crm, "company"), 1)
  assertEquals(await countRecords(crm, "relation"), 1)
})

Deno.test("Bare Gmail review ignore action updates future classification", async () => {
  const { host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const preferences = createMemoryBareGmailPreferenceStore()

  const result = await handleBareGmailReviewAction({
    host,
    workspaceId,
    message: suggestedMessage,
    actionId: "gmail.ignore_domain",
    preferences,
  })

  assertEquals(result.status, "preferences_updated")
  assertEquals(
    classifyGmailMessage(
      suggestedMessage,
      await preferences.getClassifierSettings({ workspaceId }),
    ).bucket,
    "ignore",
  )
})

function setup() {
  const crm = createCrmKernel({ now: fixedNow, id: sequenceId() })
  const host = createExtensionHost({ crm, now: fixedNow })
  return { crm, host }
}

async function countRecords(crm: CrmKernel, type: EntityType): Promise<number> {
  return (await crm.read("record.search", { workspaceId, type })).length
}

function fixedNow(): Date {
  return new Date("2026-01-01T00:00:00.000Z")
}

function sequenceId(): () => string {
  let index = 0
  return () => `id_${++index}`
}
