import { assertEquals } from "jsr:@std/assert"
import { type GmailMessageSnapshot } from "../src/index.ts"
import {
  createBareGmailAddonCard,
  createBareGmailGoogleWorkspaceManifest,
  toGoogleWorkspaceCardSpec,
} from "../src/adapters/gmail/mod.ts"

const message: GmailMessageSnapshot = {
  id: "msg_1",
  threadId: "thread_1",
  subject: "Renewal pricing and next steps",
  snippet: "Can we review the pricing proposal and schedule a follow-up?",
  from: { email: "ada@acme.com", name: "Ada" },
  to: [{ email: "sales@example.com" }],
  date: "2026-01-02T00:00:00.000Z",
}

Deno.test("Bare Gmail Google Workspace manifest uses Gmail contextual trigger", () => {
  assertEquals(
    createBareGmailGoogleWorkspaceManifest({
      logoUrl: "https://example.com/logo.png",
    }),
    {
      addOns: {
        common: {
          name: "Bare Gmail",
          logoUrl: "https://example.com/logo.png",
          homepageTrigger: {
            runFunction: "bareGmailHomepage",
          },
        },
        gmail: {
          contextualTriggers: [{
            unconditional: {},
            onTriggerFunction: "bareGmailMessageOpen",
          }],
        },
      },
      oauthScopes: [
        "https://www.googleapis.com/auth/gmail.addons.current.message.metadata",
        "https://www.googleapis.com/auth/script.external_request",
      ],
    },
  )
})

Deno.test("Bare Gmail Google Workspace adapter maps card sections widgets and actions", () => {
  const card = createBareGmailAddonCard({
    workspaceId: "workspace_1",
    message,
    classifierSettings: {
      knownCustomerDomains: ["acme.com"],
    },
    matches: [{
      ref: { type: "company", id: "company_1" },
      label: "Acme Corp",
      detail: "Open renewal",
    }],
  })

  const spec = toGoogleWorkspaceCardSpec(card, {
    messageId: message.id,
    threadId: message.threadId,
    actionFunctionName: "handleBareAction",
  })
  const actions = spec.sections.at(-1)?.widgets[0]
  if (!actions || !("buttonSet" in actions)) throw new Error("Expected button set")

  assertEquals(spec.header, {
    title: "Bare",
    subtitle: "Renewal pricing and next steps",
  })
  assertEquals(spec.sections.map((section) => section.header), [
    "Message",
    "CRM context",
    "Recent timeline",
    "Actions",
  ])
  assertEquals(spec.sections[1].widgets[0], {
    decoratedText: {
      topLabel: "Acme Corp",
      text: "Open renewal",
    },
  })
  assertEquals(actions.buttonSet.buttons[0], {
    text: "Save",
    textButtonStyle: "FILLED",
    onClick: {
      action: {
        functionName: "handleBareAction",
        parameters: [
          { key: "actionId", value: "gmail.save_activity" },
          { key: "messageId", value: "msg_1" },
          { key: "threadId", value: "thread_1" },
        ],
      },
    },
  })
})
