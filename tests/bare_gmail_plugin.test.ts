import { assertEquals, assertRejects } from "jsr:@std/assert"
import {
  createCrmKernel,
  createExtensionHost,
  type CrmKernel,
  type EntityType,
  ExtensionHostError,
  type GmailMessageSnapshot,
} from "../src/index.ts"
import {
  BARE_GMAIL_PLUGIN_ID,
  BARE_GMAIL_REQUIRED_CAPABILITIES,
  bareGmailPluginManifest,
  createBareGmailPluginRunner,
  installBareGmailPlugin,
} from "../plugins/bare-gmail/mod.ts"

const workspaceId = "workspace_1"

const baseMessage: GmailMessageSnapshot = {
  id: "msg_1",
  threadId: "thread_1",
  historyId: "hist_1",
  subject: "Renewal pricing and next steps",
  snippet: "Can we review the pricing proposal and schedule a follow-up?",
  from: { email: "ada@acme.com", name: "Ada" },
  to: [{ email: "sales@example.com" }],
  date: "2026-01-02T00:00:00.000Z",
}

Deno.test("Bare Gmail plugin manifest is valid and installable per workspace", () => {
  const { host } = setup()

  const state = installBareGmailPlugin(host, { workspaceId })

  assertEquals(bareGmailPluginManifest.id, BARE_GMAIL_PLUGIN_ID)
  assertEquals(state.pluginId, BARE_GMAIL_PLUGIN_ID)
  assertEquals(state.approvedCapabilities, BARE_GMAIL_REQUIRED_CAPABILITIES)
  assertEquals(host.listCollectionProfiles({ workspaceId }).map((profile) => profile.id), [
    "gmail.thread",
  ])
})

Deno.test("Bare Gmail runner writes promoted messages idempotently through the host", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const runner = createBareGmailPluginRunner({
    host,
    workspaceId,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })

  const first = await runner.processMessage({ message: baseMessage })

  assertEquals(first.action, "promoted")
  assertEquals(first.collection?.status, "created")
  assertEquals(first.activity?.status, "created")
  assertEquals(first.task?.status, "created")
  assertEquals(first.activity?.record.related, [
    { type: "collection", id: first.collection?.record.id },
  ])
  assertEquals(first.task?.record.related, [
    { type: "collection", id: first.collection?.record.id },
    { type: "activity", id: first.activity?.record.id },
  ])

  const second = await runner.processMessage({ message: baseMessage })

  assertEquals(second.collection?.status, "matched")
  assertEquals(second.activity?.status, "matched")
  assertEquals(second.task?.status, "matched")
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Gmail runner reuses a thread collection for later messages", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const runner = createBareGmailPluginRunner({
    host,
    workspaceId,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })
  const first = await runner.processMessage({ message: baseMessage, createFollowUpTask: false })
  const laterMessage: GmailMessageSnapshot = {
    ...baseMessage,
    id: "msg_2",
    historyId: "hist_2",
    snippet: "Approved. Please send the updated proposal.",
  }

  const second = await runner.processMessage({
    message: laterMessage,
    createFollowUpTask: false,
  })

  assertEquals(second.collection?.status, "matched")
  assertEquals(second.collection?.record.id, first.collection?.record.id)
  assertEquals(second.activity?.status, "created")
  assertEquals(second.activity?.record.related, [
    { type: "collection", id: first.collection?.record.id },
  ])
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 2)
})

Deno.test("Bare Gmail runner skips ignored and suggestion-only messages by default", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const runner = createBareGmailPluginRunner({ host, workspaceId })

  const ignored = await runner.processMessage({
    message: {
      ...baseMessage,
      id: "newsletter_1",
      threadId: "newsletter_thread",
      subject: "Weekly digest",
      snippet: "unsubscribe here",
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
    },
  })
  const suggested = await runner.processMessage({
    message: {
      ...baseMessage,
      id: "support_1",
      threadId: "support_thread",
      subject: "Support issue",
      snippet: "We are blocked by a bug.",
      from: { email: "newlead@unknown.test" },
    },
  })

  assertEquals(ignored.action, "ignored")
  assertEquals(ignored.skippedReason, "ignored")
  assertEquals(suggested.action, "suggested")
  assertEquals(suggested.skippedReason, "suggest_needs_confirmation")
  assertEquals(await countRecords(crm, "collection"), 0)
  assertEquals(await countRecords(crm, "activity"), 0)
  assertEquals(await countRecords(crm, "task"), 0)
})

Deno.test("Bare Gmail runner cannot read or write without approved capabilities", async () => {
  const { host } = setup()
  host.installPlugin({
    workspaceId,
    manifest: bareGmailPluginManifest,
    approvedCapabilities: ["plugin:profiles"],
    enabled: true,
  })
  const runner = createBareGmailPluginRunner({
    host,
    workspaceId,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })

  await assertRejects(
    () => runner.processMessage({ message: baseMessage }),
    ExtensionHostError,
    "not approved",
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
