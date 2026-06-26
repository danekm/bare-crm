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
  BARE_GMAIL_SYNC_ID,
  bareGmailPluginManifest,
  createMemoryBareGmailSyncStateStore,
  createStaticBareGmailSyncTransport,
  installBareGmailPlugin,
  syncBareGmailMessages,
} from "../src/adapters/gmail/mod.ts"

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

Deno.test("Bare Gmail sync processes a fake transport batch and advances cursor after success", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const state = createMemoryBareGmailSyncStateStore()
  const transport = createStaticBareGmailSyncTransport([{
    cursor: null,
    messages: [baseMessage],
    nextCursor: "hist_2",
  }])

  const result = await syncBareGmailMessages({
    host,
    workspaceId,
    state,
    transport,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })

  assertEquals(result.cursorBefore, null)
  assertEquals(result.cursorAfter, "hist_2")
  assertEquals(result.fetched, 1)
  assertEquals(result.processed, 1)
  assertEquals(result.promoted, 1)
  assertEquals(result.collectionsCreated, 1)
  assertEquals(result.activitiesCreated, 1)
  assertEquals(result.tasksCreated, 1)
  assertEquals(await currentCursor(state), "hist_2")
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)

  const second = await syncBareGmailMessages({
    host,
    workspaceId,
    state,
    transport,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })

  assertEquals(second.cursorBefore, "hist_2")
  assertEquals(second.fetched, 0)
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Gmail sync does not advance cursor when a write fails", async () => {
  const { crm, host } = setup()
  host.installPlugin({
    workspaceId,
    manifest: bareGmailPluginManifest,
    approvedCapabilities: [
      "plugin:profiles",
      "plugin:sync",
      "crm:read:record.search",
      "crm:write:collection.create",
    ],
    enabled: true,
  })
  const state = createMemoryBareGmailSyncStateStore()
  const transport = createStaticBareGmailSyncTransport([{
    cursor: null,
    messages: [baseMessage],
    nextCursor: "hist_2",
  }])

  await assertRejects(
    () =>
      syncBareGmailMessages({
        host,
        workspaceId,
        state,
        transport,
        classifierSettings: { knownCustomerDomains: ["acme.com"] },
      }),
    ExtensionHostError,
    "not approved",
  )

  assertEquals(await currentCursor(state), null)
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 0)
  assertEquals(await countRecords(crm, "task"), 0)

  host.approveCapabilities({
    workspaceId,
    pluginId: BARE_GMAIL_PLUGIN_ID,
    capabilities: ["crm:write:activity.create", "crm:write:task.create"],
  })

  const retry = await syncBareGmailMessages({
    host,
    workspaceId,
    state,
    transport,
    classifierSettings: { knownCustomerDomains: ["acme.com"] },
  })

  assertEquals(retry.cursorBefore, null)
  assertEquals(retry.cursorAfter, "hist_2")
  assertEquals(retry.collectionsCreated, 0)
  assertEquals(retry.activitiesCreated, 1)
  assertEquals(retry.tasksCreated, 1)
  assertEquals(await currentCursor(state), "hist_2")
  assertEquals(await countRecords(crm, "collection"), 1)
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Gmail sync skips ignored messages and still advances cursor", async () => {
  const { crm, host } = setup()
  installBareGmailPlugin(host, { workspaceId })
  const state = createMemoryBareGmailSyncStateStore()
  const transport = createStaticBareGmailSyncTransport([{
    cursor: null,
    messages: [{
      ...baseMessage,
      id: "newsletter_1",
      threadId: "newsletter_thread",
      subject: "Weekly digest",
      snippet: "unsubscribe here",
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
    }],
    nextCursor: "hist_ignored",
  }])

  const result = await syncBareGmailMessages({ host, workspaceId, state, transport })

  assertEquals(result.ignored, 1)
  assertEquals(result.promoted, 0)
  assertEquals(result.collectionsCreated, 0)
  assertEquals(result.activitiesCreated, 0)
  assertEquals(result.tasksCreated, 0)
  assertEquals(await currentCursor(state), "hist_ignored")
  assertEquals(await countRecords(crm, "collection"), 0)
  assertEquals(await countRecords(crm, "activity"), 0)
  assertEquals(await countRecords(crm, "task"), 0)
})

Deno.test("Bare Gmail sync requires explicit plugin sync capability", async () => {
  const { host } = setup()
  host.installPlugin({
    workspaceId,
    manifest: bareGmailPluginManifest,
    approvedCapabilities: BARE_GMAIL_REQUIRED_CAPABILITIES.filter((capability) =>
      capability !== "plugin:sync"
    ),
    enabled: true,
  })
  const state = createMemoryBareGmailSyncStateStore()
  const transport = createStaticBareGmailSyncTransport([{
    cursor: null,
    messages: [baseMessage],
    nextCursor: "hist_2",
  }])

  await assertRejects(
    () =>
      syncBareGmailMessages({
        host,
        workspaceId,
        state,
        transport,
        classifierSettings: { knownCustomerDomains: ["acme.com"] },
      }),
    ExtensionHostError,
    "plugin:sync",
  )
  assertEquals(transport.calls, [])
  assertEquals(await currentCursor(state), null)
})

function setup() {
  const crm = createCrmKernel({ now: fixedNow, id: sequenceId() })
  const host = createExtensionHost({ crm, now: fixedNow })
  return { crm, host }
}

async function currentCursor(
  state: ReturnType<typeof createMemoryBareGmailSyncStateStore>,
): Promise<string | null> {
  return await state.getCursor({
    workspaceId,
    pluginId: BARE_GMAIL_PLUGIN_ID,
    syncId: BARE_GMAIL_SYNC_ID,
  })
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
