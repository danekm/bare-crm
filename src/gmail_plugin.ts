import type { Activity, CreateInput, EntityRef, ExternalRef, SourceKind, Task } from "./types.ts"

export type GmailAddress = {
  email: string
  name?: string
}

export type GmailMessageSnapshot = {
  id: string
  threadId: string
  historyId?: string
  subject?: string
  snippet?: string
  bodyText?: string
  from?: GmailAddress
  to?: GmailAddress[]
  cc?: GmailAddress[]
  date?: string
  internalDate?: string
  labelIds?: string[]
  headers?: Record<string, string>
}

export type GmailClassificationBucket = "ignore" | "observe_only" | "suggest" | "promote"

export type GmailClassification = {
  bucket: GmailClassificationBucket
  confidence: number
  reasons: string[]
  signals: string[]
  suggestedActions: string[]
}

export type GmailClassifierSettings = {
  internalDomains?: string[]
  ignoredSenders?: string[]
  ignoredDomains?: string[]
  knownCustomerDomains?: string[]
}

export type GmailContextRequest = {
  messageRef: ExternalRef
  threadRef: ExternalRef
  participantEmails: string[]
  candidateDomains: string[]
}

export type GmailActivityDraftInput = {
  workspaceId: string
  message: GmailMessageSnapshot
  classification: GmailClassification
  related?: EntityRef[]
}

export type GmailTaskDraftInput = {
  workspaceId: string
  message: GmailMessageSnapshot
  related?: EntityRef[]
}

const businessSignals = new Map<string, string[]>([
  ["pricing", ["pricing", "price", "budget", "quote", "proposal"]],
  ["legal", ["legal", "contract", "msa", "dpa", "terms"]],
  ["renewal", ["renewal", "renew", "subscription"]],
  ["cancellation", ["cancel", "cancellation", "churn"]],
  ["timeline", ["timeline", "deadline", "close date", "go-live", "launch"]],
  ["approval", ["approve", "approved", "approval", "decision"]],
  ["meeting", ["meeting", "demo", "call", "scheduled", "calendar"]],
  ["follow_up", ["follow up", "follow-up", "next step", "circle back"]],
  ["support_risk", ["support", "bug", "issue", "complaint", "blocked", "risk"]],
])

const automatedSenderPattern = /(^|[-_.])(no[-_]?reply|noreply|donotreply|mailer|notifications?)@/i
const automatedSubjectPattern = /\b(receipt|digest|newsletter|unsubscribe|verification code)\b/i

export function classifyGmailMessage(
  message: GmailMessageSnapshot,
  settings: GmailClassifierSettings = {},
): GmailClassification {
  const reasons: string[] = []
  const signals: string[] = []
  const suggestedActions = ["save_activity"]
  const sender = normalizeEmail(message.from?.email)
  const senderDomain = emailDomain(sender)
  const normalizedSettings = normalizeSettings(settings)

  if (
    sender &&
    (normalizedSettings.ignoredSenders.has(sender) ||
      normalizedSettings.ignoredDomains.has(senderDomain))
  ) {
    return classification("ignore", 1, ["ignored_sender_or_domain"], [], ["unignore_sender"])
  }

  if (isInternalOnly(message, normalizedSettings.internalDomains)) {
    return classification("ignore", 0.98, ["internal_only_thread"], [], [])
  }

  if (isNewsletter(message)) {
    return classification("ignore", 0.96, ["newsletter_or_bulk_mail"], [], [
      "mark_not_crm_relevant",
    ])
  }

  if (
    sender && automatedSenderPattern.test(sender) &&
    automatedSubjectPattern.test(messageText(message))
  ) {
    return classification("ignore", 0.92, ["automated_system_mail"], [], ["mark_not_crm_relevant"])
  }

  for (const [signal, keywords] of businessSignals) {
    if (keywords.some((keyword) => messageText(message).includes(keyword))) {
      signals.push(signal)
    }
  }

  const knownCustomer = normalizedSettings.knownCustomerDomains.has(senderDomain)
  if (knownCustomer) reasons.push("known_customer_domain")
  if (signals.length > 0) reasons.push("business_signal")

  if (knownCustomer && signals.length > 0) {
    return classification("promote", 0.9, reasons, signals, actionsForSignals(signals))
  }

  if (knownCustomer) {
    return classification("suggest", 0.74, reasons, signals, [
      "attach_to_deal",
      "save_activity",
      "mark_not_crm_relevant",
    ])
  }

  if (signals.length >= 2) {
    return classification("promote", 0.82, reasons, signals, actionsForSignals(signals))
  }

  if (signals.length === 1) {
    return classification("suggest", 0.68, reasons, signals, [
      "create_lead",
      ...actionsForSignals(signals),
      "mark_not_crm_relevant",
    ])
  }

  return classification("observe_only", 0.55, ["external_mail_without_business_signal"], [], [
    "save_activity",
    "ignore_sender",
    "ignore_domain",
  ])
}

export function createGmailContextRequest(
  message: GmailMessageSnapshot,
): GmailContextRequest {
  const participantEmails = uniqueEmails([
    message.from,
    ...(message.to ?? []),
    ...(message.cc ?? []),
  ])

  return {
    messageRef: gmailMessageExternalRef(message),
    threadRef: gmailThreadExternalRef(message),
    participantEmails,
    candidateDomains: uniqueStrings(participantEmails.map(emailDomain).filter(Boolean)),
  }
}

export function createGmailExternalRefs(
  message: GmailMessageSnapshot,
): ExternalRef[] {
  const refs = [gmailMessageExternalRef(message), gmailThreadExternalRef(message)]
  if (message.historyId) {
    refs.push({
      system: "gmail",
      id: `history:${message.historyId}`,
      kind: "source",
    })
  }
  return refs
}

export function gmailMessageDedupeKey(message: GmailMessageSnapshot): string {
  return `${gmailMessageExternalRef(message).system}:${gmailMessageExternalRef(message).id}`
}

export function createGmailActivityInput(
  input: GmailActivityDraftInput,
): CreateInput<Activity> {
  const { message, classification } = input
  return {
    workspaceId: input.workspaceId,
    kind: "email",
    subject: message.subject,
    body: message.snippet ?? message.bodyText,
    occurredAt: gmailOccurredAt(message),
    direction: "inbound",
    related: input.related,
    source: "plugin" satisfies SourceKind,
    externalRefs: createGmailExternalRefs(message),
    custom: {
      gmail: {
        messageId: message.id,
        threadId: message.threadId,
        historyId: message.historyId,
        classification: classification.bucket,
        confidence: classification.confidence,
        signals: classification.signals,
        from: message.from,
        to: message.to,
        cc: message.cc,
      },
    },
  }
}

export function createGmailFollowUpTaskInput(
  input: GmailTaskDraftInput,
): CreateInput<Task> {
  return {
    workspaceId: input.workspaceId,
    title: `Follow up: ${input.message.subject ?? "Gmail thread"}`,
    status: "todo",
    related: input.related,
    source: "plugin",
    externalRefs: createGmailExternalRefs(input.message),
    custom: {
      gmail: {
        messageId: input.message.id,
        threadId: input.message.threadId,
      },
    },
  }
}

function gmailMessageExternalRef(message: GmailMessageSnapshot): ExternalRef {
  return {
    system: "gmail",
    id: `message:${message.id}`,
    kind: "source",
  }
}

function gmailThreadExternalRef(message: GmailMessageSnapshot): ExternalRef {
  return {
    system: "gmail",
    id: `thread:${message.threadId}`,
    kind: "source",
  }
}

function classification(
  bucket: GmailClassificationBucket,
  confidence: number,
  reasons: string[],
  signals: string[],
  suggestedActions: string[],
): GmailClassification {
  return {
    bucket,
    confidence,
    reasons,
    signals,
    suggestedActions: uniqueStrings(suggestedActions),
  }
}

function normalizeSettings(settings: GmailClassifierSettings) {
  return {
    internalDomains: new Set((settings.internalDomains ?? []).map(normalizeDomain)),
    ignoredSenders: new Set((settings.ignoredSenders ?? []).map(normalizeEmail)),
    ignoredDomains: new Set((settings.ignoredDomains ?? []).map(normalizeDomain)),
    knownCustomerDomains: new Set((settings.knownCustomerDomains ?? []).map(normalizeDomain)),
  }
}

function isInternalOnly(
  message: GmailMessageSnapshot,
  internalDomains: Set<string>,
): boolean {
  if (internalDomains.size === 0) return false
  const participantDomains = uniqueEmails([
    message.from,
    ...(message.to ?? []),
    ...(message.cc ?? []),
  ]).map(emailDomain).filter(Boolean)
  return participantDomains.length > 0 &&
    participantDomains.every((domain) => internalDomains.has(domain))
}

function isNewsletter(message: GmailMessageSnapshot): boolean {
  const headers = normalizeHeaders(message.headers)
  const labels = new Set((message.labelIds ?? []).map((label) => label.toUpperCase()))
  return headers.has("list-unsubscribe") ||
    labels.has("CATEGORY_PROMOTIONS") ||
    labels.has("CATEGORY_UPDATES") ||
    /\bunsubscribe\b/i.test(message.snippet ?? "")
}

function actionsForSignals(signals: string[]): string[] {
  const actions = ["save_activity", "attach_to_deal"]
  if (
    signals.includes("follow_up") || signals.includes("meeting") || signals.includes("support_risk")
  ) {
    actions.push("create_task")
  }
  if (signals.includes("pricing") || signals.includes("renewal") || signals.includes("approval")) {
    actions.push("update_record")
  }
  return actions
}

function messageText(message: GmailMessageSnapshot): string {
  return `${message.subject ?? ""} ${message.snippet ?? ""} ${message.bodyText ?? ""}`.toLowerCase()
}

function gmailOccurredAt(message: GmailMessageSnapshot): string {
  if (message.date) return message.date
  if (message.internalDate && /^\d+$/.test(message.internalDate)) {
    return new Date(Number(message.internalDate)).toISOString()
  }
  return "1970-01-01T00:00:00.000Z"
}

function normalizeHeaders(headers: Record<string, string> | undefined): Set<string> {
  return new Set(Object.keys(headers ?? {}).map((header) => header.toLowerCase()))
}

function uniqueEmails(addresses: Array<GmailAddress | undefined>): string[] {
  return uniqueStrings(addresses.map((address) => normalizeEmail(address?.email)).filter(Boolean))
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
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
