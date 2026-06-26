import manifestJson from "./plugin.json" with { type: "json" }
import {
  classifyGmailMessage,
  createGmailActivityInput,
  createGmailContextRequest,
  createGmailFollowUpTaskInput,
  createGmailThreadCollectionInput,
  validatePluginManifest,
} from "../../index.ts"
import type {
  Activity,
  AnyRecord,
  Collection,
  EntityRef,
  EntityType,
  ExtensionHost,
  ExtensionPluginState,
  ExternalRef,
  GmailClassification,
  GmailClassificationBucket,
  GmailClassifierSettings,
  GmailMessageSnapshot,
  PluginManifest,
  PluginRuntimeCapability,
  Task,
} from "../../index.ts"

export const BARE_GMAIL_PLUGIN_ID = "bare.gmail"

export const BARE_GMAIL_REQUIRED_CAPABILITIES: PluginRuntimeCapability[] = [
  "plugin:profiles",
  "plugin:commands",
  "plugin:ui",
  "plugin:sync",
  "crm:read:record.search",
  "crm:write:person.create",
  "crm:write:company.create",
  "crm:write:collection.create",
  "crm:write:activity.create",
  "crm:write:task.create",
  "crm:write:relation.create",
]

export const bareGmailPluginManifest: PluginManifest = validatePluginManifest(manifestJson)

export type BareGmailPluginInstallInput = {
  workspaceId: string
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type BareGmailPluginRunnerOptions = {
  host: ExtensionHost
  workspaceId: string
  pluginId?: string
  classifierSettings?: GmailClassifierSettings
  writeBuckets?: GmailClassificationBucket[]
  createFollowUpTasks?: boolean
}

export type BareGmailProcessMessageInput = {
  message: GmailMessageSnapshot
  related?: EntityRef[]
  classification?: GmailClassification
  classifierSettings?: GmailClassifierSettings
  writeBuckets?: GmailClassificationBucket[]
  createFollowUpTask?: boolean
}

export type BareGmailProcessAction = "ignored" | "observed" | "suggested" | "promoted"

export type BareGmailWriteResult<T extends AnyRecord> = {
  status: "created" | "matched"
  record: T
}

export type BareGmailProcessMessageResult = {
  action: BareGmailProcessAction
  classification: GmailClassification
  collection?: BareGmailWriteResult<Collection>
  activity?: BareGmailWriteResult<Activity>
  task?: BareGmailWriteResult<Task>
  skippedReason?: "ignored" | "observe_only" | "suggest_needs_confirmation"
}

export type BareGmailPluginRunner = {
  processMessage(input: BareGmailProcessMessageInput): Promise<BareGmailProcessMessageResult>
}

export class BareGmailPluginError extends Error {
  constructor(
    readonly code: "gmail.external_ref_ambiguous",
    message: string,
  ) {
    super(message)
    this.name = "BareGmailPluginError"
  }
}

export function installBareGmailPlugin(
  host: ExtensionHost,
  input: BareGmailPluginInstallInput,
): ExtensionPluginState {
  return host.installPlugin({
    workspaceId: input.workspaceId,
    manifest: bareGmailPluginManifest,
    approvedCapabilities: input.approvedCapabilities ?? BARE_GMAIL_REQUIRED_CAPABILITIES,
    enabled: input.enabled ?? true,
  })
}

export function createBareGmailPluginRunner(
  options: BareGmailPluginRunnerOptions,
): BareGmailPluginRunner {
  return {
    processMessage(input) {
      return processBareGmailMessage({
        ...options,
        ...input,
        classifierSettings: input.classifierSettings ?? options.classifierSettings,
        writeBuckets: input.writeBuckets ?? options.writeBuckets,
        createFollowUpTask: input.createFollowUpTask ?? options.createFollowUpTasks,
      })
    },
  }
}

export async function processBareGmailMessage(
  input: BareGmailPluginRunnerOptions & BareGmailProcessMessageInput,
): Promise<BareGmailProcessMessageResult> {
  const pluginId = input.pluginId ?? BARE_GMAIL_PLUGIN_ID
  const classification = input.classification ??
    classifyGmailMessage(input.message, input.classifierSettings)
  const action = actionForBucket(classification.bucket)
  const writeBuckets = new Set(input.writeBuckets ?? ["promote"])

  if (!writeBuckets.has(classification.bucket)) {
    return {
      action,
      classification,
      skippedReason: skippedReasonForBucket(classification.bucket),
    }
  }

  const context = createGmailContextRequest(input.message)
  const baseRelated = uniqueRefs(input.related ?? [])
  const collection = await findOrCreateThreadCollection({
    host: input.host,
    workspaceId: input.workspaceId,
    pluginId,
    message: input.message,
    threadRef: context.threadRef,
    related: baseRelated,
  })
  const collectionRef: EntityRef<"collection"> = {
    type: "collection",
    id: collection.record.id,
  }
  const activity = await findOrCreateMessageActivity({
    host: input.host,
    workspaceId: input.workspaceId,
    pluginId,
    message: input.message,
    messageRef: context.messageRef,
    classification,
    related: uniqueRefs([collectionRef, ...baseRelated]),
  })

  const shouldCreateTask = (input.createFollowUpTask ?? true) &&
    classification.suggestedActions.includes("create_task")
  const task = shouldCreateTask
    ? await findOrCreateFollowUpTask({
      host: input.host,
      workspaceId: input.workspaceId,
      pluginId,
      message: input.message,
      messageRef: context.messageRef,
      related: uniqueRefs([
        collectionRef,
        { type: "activity", id: activity.record.id },
        ...baseRelated,
      ]),
    })
    : undefined

  return {
    action,
    classification,
    collection,
    activity,
    task,
  }
}

async function findOrCreateThreadCollection(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  message: GmailMessageSnapshot
  threadRef: ExternalRef
  related: EntityRef[]
}): Promise<BareGmailWriteResult<Collection>> {
  const existing = await findOneByExternalRef(input, "collection", input.threadRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "collection.create",
    input: createGmailThreadCollectionInput({
      workspaceId: input.workspaceId,
      message: input.message,
      related: input.related,
    }),
    idempotencyKey: `gmail:thread:${input.message.threadId}:collection`,
  }) as Collection

  return { status: "created", record }
}

async function findOrCreateMessageActivity(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  message: GmailMessageSnapshot
  messageRef: ExternalRef
  classification: GmailClassification
  related: EntityRef[]
}): Promise<BareGmailWriteResult<Activity>> {
  const existing = await findOneByExternalRef(input, "activity", input.messageRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "activity.create",
    input: createGmailActivityInput({
      workspaceId: input.workspaceId,
      message: input.message,
      classification: input.classification,
      related: input.related,
    }),
    idempotencyKey: `gmail:message:${input.message.id}:activity`,
  }) as Activity

  return { status: "created", record }
}

async function findOrCreateFollowUpTask(input: {
  host: ExtensionHost
  workspaceId: string
  pluginId: string
  message: GmailMessageSnapshot
  messageRef: ExternalRef
  related: EntityRef[]
}): Promise<BareGmailWriteResult<Task>> {
  const existing = await findOneByExternalRef(input, "task", input.messageRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "task.create",
    input: createGmailFollowUpTaskInput({
      workspaceId: input.workspaceId,
      message: input.message,
      related: input.related,
    }),
    idempotencyKey: `gmail:message:${input.message.id}:follow-up-task`,
  }) as Task

  return { status: "created", record }
}

async function findOneByExternalRef<T extends EntityType>(
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
      limit: 2,
    },
  })

  if (matches.length > 1) {
    throw new BareGmailPluginError(
      "gmail.external_ref_ambiguous",
      `External reference matched multiple ${type} records: ${externalRef.system}:${externalRef.id}`,
    )
  }

  return (matches[0] ?? null) as Extract<AnyRecord, { type: T }> | null
}

function actionForBucket(bucket: GmailClassificationBucket): BareGmailProcessAction {
  switch (bucket) {
    case "ignore":
      return "ignored"
    case "observe_only":
      return "observed"
    case "suggest":
      return "suggested"
    case "promote":
      return "promoted"
    default:
      bucket satisfies never
      return "observed"
  }
}

function skippedReasonForBucket(
  bucket: GmailClassificationBucket,
): BareGmailProcessMessageResult["skippedReason"] {
  switch (bucket) {
    case "ignore":
      return "ignored"
    case "observe_only":
      return "observe_only"
    case "suggest":
      return "suggest_needs_confirmation"
    case "promote":
      return undefined
    default:
      bucket satisfies never
      return undefined
  }
}

function uniqueRefs(refs: EntityRef[]): EntityRef[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = `${ref.type}:${ref.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
