import { assertEquals } from "jsr:@std/assert"
import {
  classifyGmailMessage,
  createGmailActivityInput,
  createGmailContextRequest,
  createGmailExternalRefs,
  createGmailFollowUpTaskInput,
  createGmailThreadCollectionInput,
  gmailMessageDedupeKey,
  type GmailMessageSnapshot,
} from "../src/index.ts"

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

Deno.test("Gmail classifier ignores newsletters and bulk mail", () => {
  const result = classifyGmailMessage({
    ...baseMessage,
    subject: "Weekly product digest",
    snippet: "unsubscribe here",
    headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
  })

  assertEquals(result.bucket, "ignore")
  assertEquals(result.reasons, ["newsletter_or_bulk_mail"])
})

Deno.test("Gmail classifier ignores internal-only threads", () => {
  const result = classifyGmailMessage(
    {
      ...baseMessage,
      from: { email: "alice@example.com" },
      to: [{ email: "bob@example.com" }],
      cc: [{ email: "carol@example.com" }],
    },
    { internalDomains: ["example.com"] },
  )

  assertEquals(result.bucket, "ignore")
  assertEquals(result.reasons, ["internal_only_thread"])
})

Deno.test("Gmail classifier promotes known customer business signals", () => {
  const result = classifyGmailMessage(baseMessage, {
    internalDomains: ["example.com"],
    knownCustomerDomains: ["acme.com"],
  })

  assertEquals(result.bucket, "promote")
  assertEquals(result.reasons, ["known_customer_domain", "business_signal"])
  assertEquals(result.signals, ["pricing", "renewal", "follow_up"])
  assertEquals(result.suggestedActions, [
    "save_activity",
    "attach_to_deal",
    "create_task",
    "update_record",
  ])
})

Deno.test("Gmail classifier suggests uncertain external business signals", () => {
  const result = classifyGmailMessage({
    ...baseMessage,
    subject: "Support issue",
    snippet: "We are blocked by a bug.",
    from: { email: "newlead@unknown.test" },
  })

  assertEquals(result.bucket, "suggest")
  assertEquals(result.reasons, ["business_signal"])
  assertEquals(result.signals, ["support_risk"])
  assertEquals(result.suggestedActions, [
    "create_lead",
    "save_activity",
    "attach_to_deal",
    "create_task",
    "mark_not_crm_relevant",
  ])
})

Deno.test("Gmail context and external refs use stable message and thread identity", () => {
  assertEquals(createGmailContextRequest(baseMessage), {
    messageRef: { system: "gmail", id: "message:msg_1", kind: "source" },
    threadRef: { system: "gmail", id: "thread:thread_1", kind: "source" },
    participantEmails: ["ada@acme.com", "sales@example.com"],
    candidateDomains: ["acme.com", "example.com"],
  })
  assertEquals(createGmailExternalRefs(baseMessage), [
    { system: "gmail", id: "message:msg_1", kind: "source" },
    { system: "gmail", id: "thread:thread_1", kind: "source" },
    { system: "gmail", id: "history:hist_1", kind: "source" },
  ])
  assertEquals(gmailMessageDedupeKey(baseMessage), "gmail:message:msg_1")
})

Deno.test("Gmail plugin maps promoted messages to existing kernel primitives", () => {
  const classification = classifyGmailMessage(baseMessage, {
    knownCustomerDomains: ["acme.com"],
  })
  const related = [{ type: "company" as const, id: "company_1" }]

  assertEquals(
    createGmailThreadCollectionInput({
      workspaceId: "workspace_1",
      message: baseMessage,
      related,
    }),
    {
      workspaceId: "workspace_1",
      title: "Renewal pricing and next steps",
      kind: "gmail.thread",
      status: "open",
      related,
      source: "plugin",
      externalRefs: [
        { system: "gmail", id: "thread:thread_1", kind: "source" },
      ],
      custom: {
        gmail: {
          threadId: "thread_1",
          firstMessageId: "msg_1",
        },
      },
    },
  )

  assertEquals(
    createGmailActivityInput({
      workspaceId: "workspace_1",
      message: baseMessage,
      classification,
      related,
    }),
    {
      workspaceId: "workspace_1",
      kind: "email",
      subject: "Renewal pricing and next steps",
      body: "Can we review the pricing proposal and schedule a follow-up?",
      occurredAt: "2026-01-02T00:00:00.000Z",
      direction: "inbound",
      related,
      source: "plugin",
      externalRefs: [
        { system: "gmail", id: "message:msg_1", kind: "source" },
        { system: "gmail", id: "thread:thread_1", kind: "source" },
        { system: "gmail", id: "history:hist_1", kind: "source" },
      ],
      custom: {
        gmail: {
          messageId: "msg_1",
          threadId: "thread_1",
          historyId: "hist_1",
          classification: "promote",
          confidence: 0.9,
          signals: ["pricing", "renewal", "follow_up"],
          from: { email: "ada@acme.com", name: "Ada" },
          to: [{ email: "sales@example.com" }],
          cc: undefined,
        },
      },
    },
  )

  assertEquals(
    createGmailFollowUpTaskInput({
      workspaceId: "workspace_1",
      message: baseMessage,
      related,
    }),
    {
      workspaceId: "workspace_1",
      title: "Follow up: Renewal pricing and next steps",
      status: "todo",
      related,
      source: "plugin",
      externalRefs: [
        { system: "gmail", id: "message:msg_1", kind: "source" },
        { system: "gmail", id: "thread:thread_1", kind: "source" },
        { system: "gmail", id: "history:hist_1", kind: "source" },
      ],
      custom: {
        gmail: {
          messageId: "msg_1",
          threadId: "thread_1",
        },
      },
    },
  )
})
