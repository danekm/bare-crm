import manifestJson from "./plugin.json" with { type: "json" }
import { validatePluginManifest } from "../../index.ts"
import type {
  Activity,
  AnyRecord,
  Collection,
  EntityRef,
  EntityType,
  ExtensionHost,
  ExtensionPluginState,
  ExternalRef,
  PluginManifest,
  PluginRuntimeCapability,
  Task,
} from "../../index.ts"
import type {
  InstagramApiClient,
  InstagramReplySnapshot,
  InstagramThreadSnapshot,
  InstagramWatchedThread,
} from "./api.ts"
import {
  createInstagramReplyActivityInput,
  createInstagramReviewTaskInput,
  createInstagramThreadCollectionInput,
  instagramReplyExternalRef,
  instagramThreadExternalRef,
} from "./mapper.ts"
import type { BareInstagramPluginStateStore } from "./state.ts"

export const BARE_INSTAGRAM_PLUGIN_ID = "bare.instagram"
export const BARE_INSTAGRAM_SYNC_ID = "instagram.thread-sync"

export const BARE_INSTAGRAM_REQUIRED_CAPABILITIES: PluginRuntimeCapability[] = [
  "plugin:commands",
  "plugin:profiles",
  "plugin:sync",
  "network:external",
  "secrets:read",
  "crm:read:record.search",
  "crm:write:collection.create",
  "crm:write:activity.create",
  "crm:write:task.create",
]

export const bareInstagramPluginManifest: PluginManifest = validatePluginManifest(manifestJson)

export type BareInstagramPluginInstallInput = {
  workspaceId: string
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type BareInstagramRunnerOptions = {
  host: ExtensionHost
  workspaceId: string
  pluginId?: string
  includePermalink?: boolean
  includeOutbound?: boolean
  createReviewTasks?: boolean
}

export type BareInstagramProcessThreadInput = {
  thread: InstagramThreadSnapshot
  related?: EntityRef[]
}

export type BareInstagramWriteResult<T extends AnyRecord> = {
  status: "created" | "matched"
  record: T
}

export type BareInstagramProcessThreadResult = {
  action: "observed"
  collection: BareInstagramWriteResult<Collection>
  activities: Array<BareInstagramWriteResult<Activity>>
  tasks: Array<BareInstagramWriteResult<Task>>
}

export type BareInstagramRunner = {
  processThread(input: BareInstagramProcessThreadInput): Promise<BareInstagramProcessThreadResult>
}

export type BareInstagramSyncThreadsInput = BareInstagramRunnerOptions & {
  client: InstagramApiClient
  state: BareInstagramPluginStateStore
  watchedThreads?: InstagramWatchedThread[]
  limit?: number
}

export type BareInstagramSyncThreadsResult = {
  watched: number
  fetched: number
  repliesSeen: number
  activitiesCreated: number
  tasksCreated: number
}

export class BareInstagramPluginError extends Error {
  constructor(
    readonly code:
      | "instagram.external_ref_ambiguous"
      | "instagram.capability_not_approved",
    message: string,
  ) {
    super(message)
    this.name = "BareInstagramPluginError"
  }
}

export function installBareInstagramPlugin(
  host: ExtensionHost,
  input: BareInstagramPluginInstallInput,
): ExtensionPluginState {
  return host.installPlugin({
    workspaceId: input.workspaceId,
    manifest: bareInstagramPluginManifest,
    approvedCapabilities: input.approvedCapabilities ?? BARE_INSTAGRAM_REQUIRED_CAPABILITIES,
    enabled: input.enabled ?? true,
  })
}

export function createBareInstagramRunner(
  options: BareInstagramRunnerOptions,
): BareInstagramRunner {
  return {
    processThread(input) {
      return processBareInstagramThread({ ...options, ...input })
    },
  }
}

export async function processBareInstagramThread(
  input: BareInstagramRunnerOptions & BareInstagramProcessThreadInput,
): Promise<BareInstagramProcessThreadResult> {
  const pluginId = input.pluginId ?? BARE_INSTAGRAM_PLUGIN_ID
  const collection = await findOrCreateThreadCollection({ ...input, pluginId })
  const related = uniqueRefs([
    { type: "collection", id: collection.record.id },
    ...(input.related ?? []),
  ])
  const replies = input.includeOutbound
    ? input.thread.replies
    : input.thread.replies.filter((reply) => (reply.direction ?? "inbound") === "inbound")
  const activities: Array<BareInstagramWriteResult<Activity>> = []
  const tasks: Array<BareInstagramWriteResult<Task>> = []

  for (const reply of replies) {
    const activity = await findOrCreateReplyActivity({ ...input, pluginId, related, reply })
    activities.push(activity)
    if (input.createReviewTasks && reply.requiresReview) {
      tasks.push(
        await findOrCreateReviewTask({
          ...input,
          pluginId,
          reply,
          related: uniqueRefs([{ type: "activity", id: activity.record.id }, ...related]),
        }),
      )
    }
  }

  return { action: "observed", collection, activities, tasks }
}

export async function syncBareInstagramThreads(
  input: BareInstagramSyncThreadsInput,
): Promise<BareInstagramSyncThreadsResult> {
  const pluginId = input.pluginId ?? BARE_INSTAGRAM_PLUGIN_ID
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "network:external")
  const stateRef = { workspaceId: input.workspaceId, pluginId, syncId: BARE_INSTAGRAM_SYNC_ID }

  for (const thread of input.watchedThreads ?? []) {
    await input.state.watchThread({ ...stateRef, thread })
  }

  const watched = await input.state.listWatchedThreads(stateRef)
  const runner = createBareInstagramRunner(input)
  let fetched = 0
  let repliesSeen = 0
  let activitiesCreated = 0
  let tasksCreated = 0

  for (const watchedThread of watched) {
    if (input.limit !== undefined && repliesSeen >= input.limit) break
    const thread = await input.client.fetchThread({
      thread: watchedThread.thread,
      since: watchedThread.lastSeenAt,
    })
    fetched += 1
    const unseenReplies: InstagramReplySnapshot[] = []
    for (const reply of thread.replies) {
      if (input.limit !== undefined && repliesSeen + unseenReplies.length >= input.limit) break
      const seen = await input.state.hasSeenReply({
        ...stateRef,
        threadId: thread.id,
        replyId: reply.id,
      })
      if (!seen) unseenReplies.push(reply)
    }
    if (unseenReplies.length === 0) continue
    const result = await runner.processThread({ thread: { ...thread, replies: unseenReplies } })
    repliesSeen += unseenReplies.length
    activitiesCreated += result.activities.filter((activity) =>
      activity.status === "created"
    ).length
    tasksCreated += result.tasks.filter((task) => task.status === "created").length
    for (const reply of unseenReplies) {
      await input.state.markReplySeen({
        ...stateRef,
        threadId: thread.id,
        replyId: reply.id,
        occurredAt: reply.occurredAt,
      })
    }
  }

  return { watched: watched.length, fetched, repliesSeen, activitiesCreated, tasksCreated }
}

async function findOrCreateThreadCollection(
  input: BareInstagramRunnerOptions & {
    pluginId: string
    thread: InstagramThreadSnapshot
    related?: EntityRef[]
  },
): Promise<BareInstagramWriteResult<Collection>> {
  const existing = await findOneByExternalRef(
    input,
    "collection",
    instagramThreadExternalRef(input.thread),
  )
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "collection.create",
    input: createInstagramThreadCollectionInput({
      workspaceId: input.workspaceId,
      thread: input.thread,
      related: input.related,
      includePermalink: input.includePermalink,
    }),
    idempotencyKey: `instagram:thread:${input.thread.id}:collection`,
  }) as Collection
  return { status: "created", record }
}

async function findOrCreateReplyActivity(
  input: BareInstagramRunnerOptions & {
    pluginId: string
    thread: InstagramThreadSnapshot
    reply: InstagramReplySnapshot
    related: EntityRef[]
  },
): Promise<BareInstagramWriteResult<Activity>> {
  const existing = await findOneByExternalRef(
    input,
    "activity",
    instagramReplyExternalRef(input.reply),
  )
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "activity.create",
    input: createInstagramReplyActivityInput({
      workspaceId: input.workspaceId,
      thread: input.thread,
      reply: input.reply,
      related: input.related,
      includePermalink: input.includePermalink,
    }),
    idempotencyKey: `instagram:reply:${input.reply.id}:activity`,
  }) as Activity
  return { status: "created", record }
}

async function findOrCreateReviewTask(
  input: BareInstagramRunnerOptions & {
    pluginId: string
    thread: InstagramThreadSnapshot
    reply: InstagramReplySnapshot
    related: EntityRef[]
  },
): Promise<BareInstagramWriteResult<Task>> {
  const externalRef: ExternalRef = {
    system: "instagram",
    id: `review:${input.reply.id}`,
  }
  const existing = await findOneByExternalRef(input, "task", externalRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "task.create",
    input: createInstagramReviewTaskInput({
      workspaceId: input.workspaceId,
      thread: input.thread,
      reply: input.reply,
      related: input.related,
      includePermalink: input.includePermalink,
    }),
    idempotencyKey: `instagram:reply:${input.reply.id}:review-task`,
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
    throw new BareInstagramPluginError(
      "instagram.external_ref_ambiguous",
      `External reference matched multiple ${type} records: ${externalRef.system}:${externalRef.id}`,
    )
  }

  return (matches[0] ?? null) as Extract<AnyRecord, { type: T }> | null
}

function assertApprovedRuntimeCapability(
  host: ExtensionHost,
  workspaceId: string,
  pluginId: string,
  capability: PluginRuntimeCapability,
): void {
  const state = host.getPluginState({ workspaceId, pluginId })
  if (
    state?.enabled &&
    (state.approvedCapabilities.includes(capability) ||
      state.approvedCapabilities.includes("crm:*"))
  ) {
    return
  }
  throw new BareInstagramPluginError(
    "instagram.capability_not_approved",
    `Instagram plugin capability is not approved: ${capability}`,
  )
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
