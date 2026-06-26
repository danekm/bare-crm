import { classifyGmailMessage, createGmailContextRequest } from "../../index.ts"
import type {
  EntityRef,
  GmailClassification,
  GmailClassifierSettings,
  GmailContextRequest,
  GmailMessageSnapshot,
} from "../../index.ts"

export type BareGmailAddonActionId =
  | "gmail.save_activity"
  | "gmail.create_lead"
  | "gmail.create_follow_up"
  | "gmail.attach_to_record"
  | "gmail.ignore_sender"
  | "gmail.ignore_domain"
  | "gmail.mark_not_crm_relevant"

export type BareGmailAddonRecordContext = {
  ref: EntityRef
  label: string
  detail?: string
}

export type BareGmailAddonTimelineItem = {
  label: string
  occurredAt?: string
  detail?: string
}

export type BareGmailAddonAction = {
  id: BareGmailAddonActionId
  label: string
  style: "primary" | "secondary" | "destructive"
}

export type BareGmailAddonWidget =
  | { type: "text"; text: string }
  | { type: "keyValue"; key: string; value: string }
  | { type: "buttonSet"; actions: BareGmailAddonAction[] }

export type BareGmailAddonSection = {
  title: string
  widgets: BareGmailAddonWidget[]
}

export type BareGmailAddonCard = {
  title: string
  subtitle?: string
  contextRequest: GmailContextRequest
  classification: GmailClassification
  sections: BareGmailAddonSection[]
}

export type BareGmailAddonCardInput = {
  workspaceId: string
  message: GmailMessageSnapshot
  classification?: GmailClassification
  classifierSettings?: GmailClassifierSettings
  matches?: BareGmailAddonRecordContext[]
  timeline?: BareGmailAddonTimelineItem[]
}

export type BareGmailAddonBackendRequest = {
  workspaceId: string
  actionId: BareGmailAddonActionId
  messageId: string
  threadId: string
  contextRequest: GmailContextRequest
}

export type BareGmailPreferencesRef = {
  workspaceId: string
}

export type BareGmailIgnoreSenderInput = BareGmailPreferencesRef & {
  email: string
}

export type BareGmailIgnoreDomainInput = BareGmailPreferencesRef & {
  domain: string
}

export type BareGmailMarkNotRelevantInput = BareGmailPreferencesRef & {
  message: GmailMessageSnapshot
}

export type BareGmailPreferenceStore = {
  getClassifierSettings(ref: BareGmailPreferencesRef): Promise<GmailClassifierSettings>
  ignoreSender(input: BareGmailIgnoreSenderInput): Promise<GmailClassifierSettings>
  ignoreDomain(input: BareGmailIgnoreDomainInput): Promise<GmailClassifierSettings>
  markNotCrmRelevant(input: BareGmailMarkNotRelevantInput): Promise<GmailClassifierSettings>
}

type MutablePreferences = {
  internalDomains: Set<string>
  ignoredSenders: Set<string>
  ignoredDomains: Set<string>
  knownCustomerDomains: Set<string>
}

export function createBareGmailAddonCard(input: BareGmailAddonCardInput): BareGmailAddonCard {
  const classification = input.classification ??
    classifyGmailMessage(input.message, input.classifierSettings)
  const contextRequest = createGmailContextRequest(input.message)
  const matches = input.matches ?? []
  const timeline = input.timeline ?? []

  return {
    title: "Bare",
    subtitle: input.message.subject ?? "Gmail message",
    contextRequest,
    classification,
    sections: [
      {
        title: "Message",
        widgets: [
          { type: "keyValue", key: "From", value: formatAddress(input.message.from) },
          { type: "keyValue", key: "Meaning", value: formatClassification(classification) },
        ],
      },
      {
        title: "CRM context",
        widgets: matches.length > 0
          ? matches.map((match) => ({
            type: "keyValue" as const,
            key: match.label,
            value: match.detail ?? `${match.ref.type}:${match.ref.id}`,
          }))
          : [{ type: "text", text: "No matching Bare record yet." }],
      },
      {
        title: "Recent timeline",
        widgets: timeline.length > 0
          ? timeline.map((item) => ({
            type: "keyValue" as const,
            key: item.label,
            value: [item.occurredAt, item.detail].filter(Boolean).join(" - "),
          }))
          : [{ type: "text", text: "No recent Bare timeline activity." }],
      },
      {
        title: "Actions",
        widgets: [{ type: "buttonSet", actions: actionsForCard(input.message, classification) }],
      },
    ],
  }
}

export function createBareGmailAddonBackendRequest(input: {
  workspaceId: string
  actionId: BareGmailAddonActionId
  message: GmailMessageSnapshot
}): BareGmailAddonBackendRequest {
  return {
    workspaceId: input.workspaceId,
    actionId: input.actionId,
    messageId: input.message.id,
    threadId: input.message.threadId,
    contextRequest: createGmailContextRequest(input.message),
  }
}

export function createMemoryBareGmailPreferenceStore(
  seed: Record<string, GmailClassifierSettings> = {},
): BareGmailPreferenceStore {
  const preferences = new Map<string, MutablePreferences>()
  for (const [workspaceId, settings] of Object.entries(seed)) {
    preferences.set(workspaceId, mutablePreferences(settings))
  }

  return {
    async getClassifierSettings(ref) {
      return snapshotPreferences(getPreferences(preferences, ref.workspaceId))
    },
    async ignoreSender(input) {
      const prefs = getPreferences(preferences, input.workspaceId)
      prefs.ignoredSenders.add(normalizeEmail(input.email))
      return snapshotPreferences(prefs)
    },
    async ignoreDomain(input) {
      const prefs = getPreferences(preferences, input.workspaceId)
      prefs.ignoredDomains.add(normalizeDomain(input.domain))
      return snapshotPreferences(prefs)
    },
    async markNotCrmRelevant(input) {
      const prefs = getPreferences(preferences, input.workspaceId)
      const sender = normalizeEmail(input.message.from?.email)
      if (sender) prefs.ignoredSenders.add(sender)
      return snapshotPreferences(prefs)
    },
  }
}

function actionsForCard(
  message: GmailMessageSnapshot,
  classification: GmailClassification,
): BareGmailAddonAction[] {
  const actions: BareGmailAddonAction[] = []
  const sender = normalizeEmail(message.from?.email)
  const domain = emailDomain(sender)

  if (classification.bucket === "promote" || classification.bucket === "suggest") {
    actions.push({ id: "gmail.save_activity", label: "Save", style: "primary" })
    actions.push({ id: "gmail.attach_to_record", label: "Attach", style: "secondary" })
  }

  if (classification.suggestedActions.includes("create_lead")) {
    actions.push({ id: "gmail.create_lead", label: "Create lead", style: "secondary" })
  }

  if (classification.suggestedActions.includes("create_task")) {
    actions.push({ id: "gmail.create_follow_up", label: "Follow up", style: "secondary" })
  }

  if (sender) {
    actions.push({ id: "gmail.ignore_sender", label: "Ignore sender", style: "destructive" })
  }

  if (domain) {
    actions.push({ id: "gmail.ignore_domain", label: "Ignore domain", style: "destructive" })
  }

  actions.push({
    id: "gmail.mark_not_crm_relevant",
    label: "Not relevant",
    style: "secondary",
  })

  return dedupeActions(actions)
}

function formatAddress(address: GmailMessageSnapshot["from"]): string {
  if (!address?.email) return "Unknown sender"
  return address.name ? `${address.name} <${address.email}>` : address.email
}

function formatClassification(classification: GmailClassification): string {
  const signals = classification.signals.length > 0 ? `: ${classification.signals.join(", ")}` : ""
  return `${classification.bucket} (${Math.round(classification.confidence * 100)}%)${signals}`
}

function getPreferences(
  preferences: Map<string, MutablePreferences>,
  workspaceId: string,
): MutablePreferences {
  const existing = preferences.get(workspaceId)
  if (existing) return existing

  const created = mutablePreferences({})
  preferences.set(workspaceId, created)
  return created
}

function mutablePreferences(settings: GmailClassifierSettings): MutablePreferences {
  return {
    internalDomains: new Set((settings.internalDomains ?? []).map(normalizeDomain)),
    ignoredSenders: new Set((settings.ignoredSenders ?? []).map(normalizeEmail)),
    ignoredDomains: new Set((settings.ignoredDomains ?? []).map(normalizeDomain)),
    knownCustomerDomains: new Set((settings.knownCustomerDomains ?? []).map(normalizeDomain)),
  }
}

function snapshotPreferences(preferences: MutablePreferences): GmailClassifierSettings {
  return {
    internalDomains: [...preferences.internalDomains],
    ignoredSenders: [...preferences.ignoredSenders],
    ignoredDomains: [...preferences.ignoredDomains],
    knownCustomerDomains: [...preferences.knownCustomerDomains],
  }
}

function dedupeActions(actions: BareGmailAddonAction[]): BareGmailAddonAction[] {
  const seen = new Set<string>()
  return actions.filter((action) => {
    if (seen.has(action.id)) return false
    seen.add(action.id)
    return true
  })
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function emailDomain(email: string): string {
  return normalizeDomain(email.split("@")[1] ?? "")
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase()
}
