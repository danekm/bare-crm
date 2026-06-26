import { assertEquals } from "jsr:@std/assert"
import { classifyGmailMessage, type GmailMessageSnapshot } from "../src/index.ts"
import {
  createBareGmailAddonBackendRequest,
  createBareGmailAddonCard,
  createMemoryBareGmailPreferenceStore,
} from "../src/adapters/gmail/mod.ts"

const workspaceId = "workspace_1"

const baseMessage: GmailMessageSnapshot = {
  id: "msg_1",
  threadId: "thread_1",
  historyId: "hist_1",
  subject: "Renewal pricing and next steps",
  snippet: "Can we review the pricing proposal and schedule a follow-up?",
  from: { email: "Ada@Acme.com", name: "Ada" },
  to: [{ email: "sales@example.com" }],
  date: "2026-01-02T00:00:00.000Z",
}

Deno.test("Bare Gmail add-on card renders current message context and actions", () => {
  const card = createBareGmailAddonCard({
    workspaceId,
    message: baseMessage,
    classifierSettings: {
      internalDomains: ["example.com"],
      knownCustomerDomains: ["acme.com"],
    },
    matches: [{
      ref: { type: "company", id: "company_1" },
      label: "Acme Corp",
      detail: "Open renewal deal",
    }],
    timeline: [{
      label: "Last activity",
      occurredAt: "2026-01-01T00:00:00.000Z",
      detail: "Discovery call",
    }],
  })

  const actionWidget = card.sections.at(-1)?.widgets[0]
  if (actionWidget?.type !== "buttonSet") throw new Error("Expected action button set")

  assertEquals(card.title, "Bare")
  assertEquals(card.subtitle, "Renewal pricing and next steps")
  assertEquals(card.classification.bucket, "promote")
  assertEquals(card.contextRequest, {
    messageRef: { system: "gmail", id: "message:msg_1", kind: "source" },
    threadRef: { system: "gmail", id: "thread:thread_1", kind: "source" },
    participantEmails: ["ada@acme.com", "sales@example.com"],
    candidateDomains: ["acme.com", "example.com"],
  })
  assertEquals(
    actionWidget.actions.map((action) => action.id),
    [
      "gmail.save_activity",
      "gmail.attach_to_record",
      "gmail.create_follow_up",
      "gmail.ignore_sender",
      "gmail.ignore_domain",
      "gmail.mark_not_crm_relevant",
    ],
  )
})

Deno.test("Bare Gmail add-on backend request carries stable message and thread context", () => {
  assertEquals(
    createBareGmailAddonBackendRequest({
      workspaceId,
      actionId: "gmail.save_activity",
      message: baseMessage,
    }),
    {
      workspaceId,
      actionId: "gmail.save_activity",
      messageId: "msg_1",
      threadId: "thread_1",
      contextRequest: {
        messageRef: { system: "gmail", id: "message:msg_1", kind: "source" },
        threadRef: { system: "gmail", id: "thread:thread_1", kind: "source" },
        participantEmails: ["ada@acme.com", "sales@example.com"],
        candidateDomains: ["acme.com", "example.com"],
      },
    },
  )
})

Deno.test("Bare Gmail preferences store ignore decisions outside kernel records", async () => {
  const store = createMemoryBareGmailPreferenceStore({
    [workspaceId]: {
      internalDomains: ["example.com"],
      knownCustomerDomains: ["acme.com"],
    },
  })

  await store.ignoreSender({ workspaceId, email: "Ada@Acme.com" })
  await store.ignoreDomain({ workspaceId, domain: "Vendor.test" })

  assertEquals(await store.getClassifierSettings({ workspaceId }), {
    internalDomains: ["example.com"],
    ignoredSenders: ["ada@acme.com"],
    ignoredDomains: ["vendor.test"],
    knownCustomerDomains: ["acme.com"],
  })
  assertEquals(
    classifyGmailMessage(
      baseMessage,
      await store.getClassifierSettings({ workspaceId }),
    ).bucket,
    "ignore",
  )
})
