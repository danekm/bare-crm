import type { BareGmailAddonAction, BareGmailAddonCard, BareGmailAddonWidget } from "./addon.ts"

export type GoogleWorkspaceAddonManifest = {
  addOns: {
    common: {
      name: string
      logoUrl?: string
      homepageTrigger?: {
        runFunction: string
      }
    }
    gmail: {
      contextualTriggers: Array<{
        unconditional: Record<string, never>
        onTriggerFunction: string
      }>
    }
  }
  oauthScopes: string[]
}

export type GoogleWorkspaceCardSpec = {
  header: {
    title: string
    subtitle?: string
  }
  sections: GoogleWorkspaceCardSectionSpec[]
}

export type GoogleWorkspaceCardSectionSpec = {
  header: string
  widgets: GoogleWorkspaceCardWidgetSpec[]
}

export type GoogleWorkspaceCardWidgetSpec =
  | { textParagraph: { text: string } }
  | { decoratedText: { topLabel: string; text: string } }
  | { buttonSet: { buttons: GoogleWorkspaceTextButtonSpec[] } }

export type GoogleWorkspaceTextButtonSpec = {
  text: string
  textButtonStyle: "FILLED" | "TEXT"
  onClick: {
    action: GoogleWorkspaceActionSpec
  }
}

export type GoogleWorkspaceActionSpec = {
  functionName: string
  parameters: Array<{ key: string; value: string }>
}

export type BareGmailGoogleAddonOptions = {
  actionFunctionName?: string
  messageId?: string
  threadId?: string
}

export function createBareGmailGoogleWorkspaceManifest(input: {
  name?: string
  logoUrl?: string
  homepageFunctionName?: string
  contextualTriggerFunctionName?: string
  oauthScopes?: string[]
} = {}): GoogleWorkspaceAddonManifest {
  return {
    addOns: {
      common: {
        name: input.name ?? "Bare Gmail",
        logoUrl: input.logoUrl,
        homepageTrigger: {
          runFunction: input.homepageFunctionName ?? "bareGmailHomepage",
        },
      },
      gmail: {
        contextualTriggers: [{
          unconditional: {},
          onTriggerFunction: input.contextualTriggerFunctionName ?? "bareGmailMessageOpen",
        }],
      },
    },
    oauthScopes: input.oauthScopes ?? [
      "https://www.googleapis.com/auth/gmail.addons.current.message.metadata",
      "https://www.googleapis.com/auth/script.external_request",
    ],
  }
}

export function toGoogleWorkspaceCardSpec(
  card: BareGmailAddonCard,
  options: BareGmailGoogleAddonOptions = {},
): GoogleWorkspaceCardSpec {
  return {
    header: {
      title: card.title,
      subtitle: card.subtitle,
    },
    sections: card.sections.map((section) => ({
      header: section.title,
      widgets: section.widgets.map((widget) => toGoogleWidget(widget, options)),
    })),
  }
}

function toGoogleWidget(
  widget: BareGmailAddonWidget,
  options: BareGmailGoogleAddonOptions,
): GoogleWorkspaceCardWidgetSpec {
  switch (widget.type) {
    case "text":
      return { textParagraph: { text: widget.text } }
    case "keyValue":
      return {
        decoratedText: {
          topLabel: widget.key,
          text: widget.value,
        },
      }
    case "buttonSet":
      return {
        buttonSet: {
          buttons: widget.actions.map((action) => toGoogleTextButton(action, options)),
        },
      }
    default:
      widget satisfies never
      return { textParagraph: { text: "" } }
  }
}

function toGoogleTextButton(
  action: BareGmailAddonAction,
  options: BareGmailGoogleAddonOptions,
): GoogleWorkspaceTextButtonSpec {
  const parameters = [
    { key: "actionId", value: action.id },
    ...(options.messageId ? [{ key: "messageId", value: options.messageId }] : []),
    ...(options.threadId ? [{ key: "threadId", value: options.threadId }] : []),
  ]

  return {
    text: action.label,
    textButtonStyle: action.style === "primary" ? "FILLED" : "TEXT",
    onClick: {
      action: {
        functionName: options.actionFunctionName ?? "bareGmailHandleAction",
        parameters,
      },
    },
  }
}
