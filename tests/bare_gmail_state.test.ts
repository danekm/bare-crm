import { assertEquals } from "jsr:@std/assert"
import { classifyGmailMessage, type GmailMessageSnapshot } from "../src/index.ts"
import {
  BARE_GMAIL_PLUGIN_ID,
  BARE_GMAIL_SYNC_ID,
  createJsonFileBareGmailPluginStateStore,
  createMemoryBareGmailPluginStateStore,
  queueBareGmailReviewItem,
} from "../src/adapters/gmail/mod.ts"

const workspaceId = "workspace_1"

const message: GmailMessageSnapshot = {
  id: "support_1",
  threadId: "thread_1",
  historyId: "hist_1",
  subject: "Support issue",
  snippet: "We are blocked by a bug.",
  from: { email: "Lead@Unknown.test", name: "Lead" },
  to: [{ email: "sales@example.com" }],
  date: "2026-01-02T00:00:00.000Z",
}

Deno.test("Bare Gmail memory plugin state store combines cursors preferences reviews and secret refs", async () => {
  const store = createMemoryBareGmailPluginStateStore()
  const classification = classifyGmailMessage(message)

  await store.setCursor({
    workspaceId,
    pluginId: BARE_GMAIL_PLUGIN_ID,
    syncId: BARE_GMAIL_SYNC_ID,
    cursor: "hist_2",
  })
  await store.ignoreDomain({ workspaceId, domain: "Unknown.test" })
  await store.setOAuthSecretRefs({
    workspaceId,
    secretRefs: {
      refreshToken: "secret://gmail/workspace_1/refresh-token",
    },
  })
  await queueBareGmailReviewItem({
    store,
    workspaceId,
    message,
    classification,
    now: fixedNow,
  })

  assertEquals(
    await store.getCursor({
      workspaceId,
      pluginId: BARE_GMAIL_PLUGIN_ID,
      syncId: BARE_GMAIL_SYNC_ID,
    }),
    "hist_2",
  )
  assertEquals(await store.getClassifierSettings({ workspaceId }), {
    internalDomains: [],
    ignoredSenders: [],
    ignoredDomains: ["unknown.test"],
    knownCustomerDomains: [],
  })
  assertEquals(await store.getOAuthSecretRefs({ workspaceId }), {
    refreshToken: "secret://gmail/workspace_1/refresh-token",
  })
  assertEquals((await store.list({ workspaceId, status: "open" })).length, 1)
})

Deno.test("Bare Gmail JSON plugin state store persists state without raw OAuth tokens", async () => {
  const dir = await Deno.makeTempDir()
  const path = `${dir}/gmail-state.json`
  const first = createJsonFileBareGmailPluginStateStore(path)

  await first.setCursor({
    workspaceId,
    pluginId: BARE_GMAIL_PLUGIN_ID,
    syncId: BARE_GMAIL_SYNC_ID,
    cursor: "hist_3",
  })
  await first.ignoreSender({ workspaceId, email: "Lead@Unknown.test" })
  await first.setOAuthSecretRefs({
    workspaceId,
    secretRefs: {
      refreshToken: "secret://gmail/workspace_1/refresh-token",
      accessToken: "secret://gmail/workspace_1/access-token",
    },
  })

  const second = createJsonFileBareGmailPluginStateStore(path)

  assertEquals(
    await second.getCursor({
      workspaceId,
      pluginId: BARE_GMAIL_PLUGIN_ID,
      syncId: BARE_GMAIL_SYNC_ID,
    }),
    "hist_3",
  )
  assertEquals(await second.getClassifierSettings({ workspaceId }), {
    internalDomains: [],
    ignoredSenders: ["lead@unknown.test"],
    ignoredDomains: [],
    knownCustomerDomains: [],
  })
  assertEquals(await second.getOAuthSecretRefs({ workspaceId }), {
    refreshToken: "secret://gmail/workspace_1/refresh-token",
    accessToken: "secret://gmail/workspace_1/access-token",
  })
  assertEquals((await Deno.readTextFile(path)).includes("raw-refresh-token-value"), false)
})

function fixedNow(): Date {
  return new Date("2026-01-01T00:00:00.000Z")
}
