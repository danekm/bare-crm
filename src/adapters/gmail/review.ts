import { createGmailContextRequest } from "../../index.ts"
import type {
  AnyRecord,
  Company,
  EntityRef,
  ExtensionHost,
  ExternalRef,
  GmailClassification,
  GmailMessageSnapshot,
  Person,
  Relation,
} from "../../index.ts"
import type { BareGmailAddonActionId, BareGmailPreferenceStore } from "./addon.ts"
import { BARE_GMAIL_PLUGIN_ID, processBareGmailMessage } from "./runner.ts"
import type { BareGmailProcessMessageResult, BareGmailWriteResult } from "./runner.ts"

export type BareGmailReviewStatus = "open" | "resolved" | "dismissed"

export type BareGmailReviewItem = {
  id: string
  workspaceId: string
  message: GmailMessageSnapshot
  classification: GmailClassification
  status: BareGmailReviewStatus
  createdAt: string
  updatedAt: string
}

export type BareGmailReviewStore = {
  upsert(item: BareGmailReviewItem): Promise<BareGmailReviewItem>
  get(input: { workspaceId: string; id: string }): Promise<BareGmailReviewItem | null>
  list(
    input: { workspaceId: string; status?: BareGmailReviewStatus },
  ): Promise<BareGmailReviewItem[]>
  resolve(input: {
    workspaceId: string
    id: string
    status: Exclude<BareGmailReviewStatus, "open">
  }): Promise<BareGmailReviewItem | null>
}

export type BareGmailReviewActionInput = {
  host: ExtensionHost
  workspaceId: string
  message: GmailMessageSnapshot
  actionId: BareGmailAddonActionId
  preferences: BareGmailPreferenceStore
  pluginId?: string
  classification?: GmailClassification
  related?: EntityRef[]
  targetRef?: EntityRef
}

export type BareGmailCreateLeadResult = {
  person: BareGmailWriteResult<Person>
  company?: BareGmailWriteResult<Company>
  relation?: BareGmailWriteResult<Relation>
}

export type BareGmailReviewActionResult = {
  actionId: BareGmailAddonActionId
  status: "processed" | "preferences_updated"
  processResult?: BareGmailProcessMessageResult
  lead?: BareGmailCreateLeadResult
}

export class BareGmailReviewError extends Error {
  constructor(
    readonly code:
      | "gmail.sender_required"
      | "gmail.target_required"
      | "gmail.unsupported_action",
    message: string,
  ) {
    super(message)
    this.name = "BareGmailReviewError"
  }
}

export function createMemoryBareGmailReviewStore(): BareGmailReviewStore {
  const items = new Map<string, BareGmailReviewItem>()

  return {
    async upsert(item) {
      const key = reviewStoreKey(item.workspaceId, item.id)
      items.set(key, { ...item })
      return { ...item }
    },
    async get(input) {
      const item = items.get(reviewStoreKey(input.workspaceId, input.id))
      return item ? { ...item } : null
    },
    async list(input) {
      return [...items.values()]
        .filter((item) => item.workspaceId === input.workspaceId)
        .filter((item) => !input.status || item.status === input.status)
        .map((item) => ({ ...item }))
    },
    async resolve(input) {
      const key = reviewStoreKey(input.workspaceId, input.id)
      const item = items.get(key)
      if (!item) return null
      const updated = {
        ...item,
        status: input.status,
        updatedAt: new Date().toISOString(),
      }
      items.set(key, updated)
      return { ...updated }
    },
  }
}

export async function queueBareGmailReviewItem(input: {
  store: BareGmailReviewStore
  workspaceId: string
  message: GmailMessageSnapshot
  classification: GmailClassification
  now?: () => Date
}): Promise<BareGmailReviewItem | null> {
  if (input.classification.bucket !== "suggest") return null

  const timestamp = (input.now ?? (() => new Date()))().toISOString()
  return await input.store.upsert({
    id: gmailReviewItemId(input.message),
    workspaceId: input.workspaceId,
    message: input.message,
    classification: input.classification,
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function handleBareGmailReviewAction(
  input: BareGmailReviewActionInput,
): Promise<BareGmailReviewActionResult> {
  const pluginId = input.pluginId ?? BARE_GMAIL_PLUGIN_ID

  switch (input.actionId) {
    case "gmail.ignore_sender":
      await input.preferences.ignoreSender({
        workspaceId: input.workspaceId,
        email: requireSender(input.message),
      })
      return { actionId: input.actionId, status: "preferences_updated" }
    case "gmail.ignore_domain":
      await input.preferences.ignoreDomain({
        workspaceId: input.workspaceId,
        domain: requireSenderDomain(input.message),
      })
      return { actionId: input.actionId, status: "preferences_updated" }
    case "gmail.mark_not_crm_relevant":
      await input.preferences.markNotCrmRelevant({
        workspaceId: input.workspaceId,
        message: input.message,
      })
      return { actionId: input.actionId, status: "preferences_updated" }
    case "gmail.save_activity":
      return {
        actionId: input.actionId,
        status: "processed",
        processResult: await processBareGmailMessage({
          host: input.host,
          workspaceId: input.workspaceId,
          pluginId,
          message: input.message,
          classification: userConfirmedClassification(input.classification),
          related: input.related,
          writeBuckets: ["promote"],
          createFollowUpTask: false,
        }),
      }
    case "gmail.create_follow_up":
      return {
        actionId: input.actionId,
        status: "processed",
        processResult: await processBareGmailMessage({
          host: input.host,
          workspaceId: input.workspaceId,
          pluginId,
          message: input.message,
          classification: userConfirmedClassification(input.classification, ["create_task"]),
          related: input.related,
          writeBuckets: ["promote"],
          createFollowUpTask: true,
        }),
      }
    case "gmail.attach_to_record":
      if (!input.targetRef) {
        throw new BareGmailReviewError(
          "gmail.target_required",
          "Attach action requires a target Bare record.",
        )
      }
      return {
        actionId: input.actionId,
        status: "processed",
        processResult: await processBareGmailMessage({
          host: input.host,
          workspaceId: input.workspaceId,
          pluginId,
          message: input.message,
          classification: userConfirmedClassification(input.classification),
          related: [input.targetRef, ...(input.related ?? [])],
          writeBuckets: ["promote"],
          createFollowUpTask: false,
        }),
      }
    case "gmail.create_lead":
      return {
        actionId: input.actionId,
        status: "processed",
        lead: await findOrCreateLead({
          host: input.host,
          workspaceId: input.workspaceId,
          pluginId,
          message: input.message,
        }),
      }
    default:
      input.actionId satisfies never
      throw new BareGmailReviewError(
        "gmail.unsupported_action",
        `Unsupported Gmail action: ${input.actionId}`,
      )
  }
}

function userConfirmedClassification(
  classification: GmailClassification | undefined,
  extraActions: string[] = [],
): GmailClassification {
  return {
    bucket: "promote",
    confidence: Math.max(classification?.confidence ?? 0, 0.99),
    reasons: [...new Set([...(classification?.reasons ?? []), "user_confirmed"])],
    signals: classification?.signals ?? [],
    suggestedActions: [
      ...new Set([
        "save_activity",
        ...(classification?.suggestedActions ?? []),
        ...extraActions,
      ]),
    ],
  }
}

async function findOrCreateLead(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  message: GmailMessageSnapshot
}): Promise<BareGmailCreateLeadResult> {
  const sender = requireSender(input.message)
  const domain = emailDomain(sender)
  const personRef = gmailSenderExternalRef(sender)
  const companyRef = domain ? gmailDomainExternalRef(domain) : undefined

  const person = await findOrCreatePerson({ ...input, sender, externalRef: personRef })
  const company = companyRef
    ? await findOrCreateCompany({ ...input, domain, externalRef: companyRef })
    : undefined
  const relation = company
    ? await findOrCreateLeadRelation({
      ...input,
      person: person.record,
      company: company.record,
      sender,
    })
    : undefined

  return { person, company, relation }
}

async function findOrCreatePerson(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  message: GmailMessageSnapshot
  sender: string
  externalRef: ExternalRef
}): Promise<BareGmailWriteResult<Person>> {
  const existing = await findOneByExternalRef(input, "person", input.externalRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "person.create",
    input: {
      workspaceId: input.workspaceId,
      name: input.message.from?.name ?? input.sender,
      emails: [{ value: input.sender, primary: true }],
      status: "lead",
      source: "plugin",
      externalRefs: [input.externalRef],
      custom: {
        gmail: {
          createdFromMessage: createGmailContextRequest(input.message).messageRef,
        },
      },
    },
    idempotencyKey: `gmail:sender:${input.sender}:person`,
  }) as Person

  return { status: "created", record }
}

async function findOrCreateCompany(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  domain: string
  externalRef: ExternalRef
}): Promise<BareGmailWriteResult<Company>> {
  const existing = await findOneByExternalRef(input, "company", input.externalRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "company.create",
    input: {
      workspaceId: input.workspaceId,
      name: input.domain,
      domains: [input.domain],
      status: "prospect",
      source: "plugin",
      externalRefs: [input.externalRef],
    },
    idempotencyKey: `gmail:domain:${input.domain}:company`,
  }) as Company

  return { status: "created", record }
}

async function findOrCreateLeadRelation(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  person: Person
  company: Company
  sender: string
}): Promise<BareGmailWriteResult<Relation>> {
  const externalRef: ExternalRef = {
    system: "gmail",
    id: `lead:${input.sender}:${input.company.id}`,
    kind: "source",
  }
  const existing = await findOneByExternalRef(input, "relation", externalRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "relation.create",
    input: {
      workspaceId: input.workspaceId,
      from: { type: "person", id: input.person.id },
      to: { type: "company", id: input.company.id },
      kind: "works_at",
      source: "plugin",
      externalRefs: [externalRef],
    },
    idempotencyKey: `gmail:lead:${input.sender}:${input.company.id}:relation`,
  }) as Relation

  return { status: "created", record }
}

async function findOneByExternalRef<T extends AnyRecord["type"]>(
  input: {
    host: ExtensionHost
    workspaceId: string
    pluginId: string
  },
  type: T,
  externalRef: ExternalRef,
): Promise<Extract<AnyRecord, { type: T }> | null> {
  const matches = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "record.search",
    input: {
      workspaceId: input.workspaceId,
      type,
      externalRef,
      limit: 1,
    },
  })

  return (matches[0] ?? null) as Extract<AnyRecord, { type: T }> | null
}

function gmailReviewItemId(message: GmailMessageSnapshot): string {
  return `gmail-review:${message.id}`
}

function reviewStoreKey(workspaceId: string, id: string): string {
  return `${workspaceId}:${id}`
}

function gmailSenderExternalRef(email: string): ExternalRef {
  return { system: "gmail", id: `sender:${email}`, kind: "source" }
}

function gmailDomainExternalRef(domain: string): ExternalRef {
  return { system: "gmail", id: `domain:${domain}`, kind: "source" }
}

function requireSender(message: GmailMessageSnapshot): string {
  const sender = normalizeEmail(message.from?.email)
  if (!sender) {
    throw new BareGmailReviewError(
      "gmail.sender_required",
      "Gmail action requires a sender email.",
    )
  }
  return sender
}

function requireSenderDomain(message: GmailMessageSnapshot): string {
  return emailDomain(requireSender(message))
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.trim().toLowerCase() ?? ""
}
