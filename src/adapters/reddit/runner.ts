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
  RedditApiClient,
  RedditReplySnapshot,
  RedditThreadSnapshot,
  RedditWatchedThread,
} from "./api.ts"
import {
  createRedditReplyActivityInput,
  createRedditReviewTaskInput,
  createRedditThreadCollectionInput,
  redditReplyExternalRef,
  redditThreadExternalRef,
} from "./mapper.ts"
import type { BareRedditPluginStateStore } from "./state.ts"

export const BARE_REDDIT_PLUGIN_ID = "bare.reddit"
export const BARE_REDDIT_SYNC_ID = "reddit.thread-sync"

export const BARE_REDDIT_REQUIRED_CAPABILITIES: PluginRuntimeCapability[] = [
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

export const bareRedditPluginManifest: PluginManifest = validatePluginManifest(manifestJson)

export type BareRedditPluginInstallInput = {
  workspaceId: string
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type BareRedditRunnerOptions = {
  host: ExtensionHost
  workspaceId: string
  pluginId?: string
  includePermalink?: boolean
  includeOutbound?: boolean
  createReviewTasks?: boolean
}

export type BareRedditProcessThreadInput = {
  thread: RedditThreadSnapshot
  related?: EntityRef[]
}

export type BareRedditWriteResult<T extends AnyRecord> = {
  status: "created" | "matched"
  record: T
}

export type BareRedditProcessThreadResult = {
  action: "observed"
  collection: BareRedditWriteResult<Collection>
  activities: Array<BareRedditWriteResult<Activity>>
  tasks: Array<BareRedditWriteResult<Task>>
}

export type BareRedditRunner = {
  processThread(input: BareRedditProcessThreadInput): Promise<BareRedditProcessThreadResult>
}

export type BareRedditSyncThreadsInput = BareRedditRunnerOptions & {
  client: RedditApiClient
  state: BareRedditPluginStateStore
  watchedThreads?: RedditWatchedThread[]
  limit?: number
}

export type BareRedditSyncThreadsResult = {
  watched: number
  fetched: number
  repliesSeen: number
  activitiesCreated: number
  tasksCreated: number
}

export class BareRedditPluginError extends Error {
  constructor(
    readonly code:
      | "reddit.external_ref_ambiguous"
      | "reddit.capability_not_approved",
    message: string,
  ) {
    super(message)
    this.name = "BareRedditPluginError"
  }
}

export function installBareRedditPlugin(
  host: ExtensionHost,
  input: BareRedditPluginInstallInput,
): ExtensionPluginState {
  return host.installPlugin({
    workspaceId: input.workspaceId,
    manifest: bareRedditPluginManifest,
    approvedCapabilities: input.approvedCapabilities ?? BARE_REDDIT_REQUIRED_CAPABILITIES,
    enabled: input.enabled ?? true,
  })
}

export function createBareRedditRunner(options: BareRedditRunnerOptions): BareRedditRunner {
  return {
    processThread(input) {
      return processBareRedditThread({ ...options, ...input })
    },
  }
}

export async function processBareRedditThread(
  input: BareRedditRunnerOptions & BareRedditProcessThreadInput,
): Promise<BareRedditProcessThreadResult> {
  const pluginId = input.pluginId ?? BARE_REDDIT_PLUGIN_ID
  const collection = await findOrCreateThreadCollection({ ...input, pluginId })
  const related = uniqueRefs([
    { type: "collection", id: collection.record.id },
    ...(input.related ?? []),
  ])
  const replies = input.includeOutbound
    ? input.thread.replies
    : input.thread.replies.filter((reply) => (reply.direction ?? "inbound") === "inbound")
  const activities: Array<BareRedditWriteResult<Activity>> = []
  const tasks: Array<BareRedditWriteResult<Task>> = []

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

export async function syncBareRedditThreads(
  input: BareRedditSyncThreadsInput,
): Promise<BareRedditSyncThreadsResult> {
  const pluginId = input.pluginId ?? BARE_REDDIT_PLUGIN_ID
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "network:external")
  const stateRef = { workspaceId: input.workspaceId, pluginId, syncId: BARE_REDDIT_SYNC_ID }

  for (const thread of input.watchedThreads ?? []) {
    await input.state.watchThread({ ...stateRef, thread })
  }

  const watched = await input.state.listWatchedThreads(stateRef)
  const runner = createBareRedditRunner(input)
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
    const unseenReplies: RedditReplySnapshot[] = []
    for (const reply of thread.replies) {
      const replyId = reply.name ?? reply.id
      if (input.limit !== undefined && repliesSeen + unseenReplies.length >= input.limit) break
      const seen = await input.state.hasSeenReply({
        ...stateRef,
        threadId: thread.id,
        replyId,
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
        replyId: reply.name ?? reply.id,
        occurredAt: reply.occurredAt,
      })
    }
  }

  return { watched: watched.length, fetched, repliesSeen, activitiesCreated, tasksCreated }
}

async function findOrCreateThreadCollection(
  input: BareRedditRunnerOptions & {
    pluginId: string
    thread: RedditThreadSnapshot
    related?: EntityRef[]
  },
): Promise<BareRedditWriteResult<Collection>> {
  const existing = await findOneByExternalRef(
    input,
    "collection",
    redditThreadExternalRef(input.thread),
  )
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "collection.create",
    input: createRedditThreadCollectionInput({
      workspaceId: input.workspaceId,
      thread: input.thread,
      related: input.related,
      includePermalink: input.includePermalink,
    }),
    idempotencyKey: `reddit:thread:${input.thread.id}:collection`,
  }) as Collection
  return { status: "created", record }
}

async function findOrCreateReplyActivity(
  input: BareRedditRunnerOptions & {
    pluginId: string
    thread: RedditThreadSnapshot
    reply: RedditReplySnapshot
    related: EntityRef[]
  },
): Promise<BareRedditWriteResult<Activity>> {
  const existing = await findOneByExternalRef(
    input,
    "activity",
    redditReplyExternalRef(input.reply),
  )
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "activity.create",
    input: createRedditReplyActivityInput({
      workspaceId: input.workspaceId,
      thread: input.thread,
      reply: input.reply,
      related: input.related,
      includePermalink: input.includePermalink,
    }),
    idempotencyKey: `reddit:reply:${input.reply.name ?? input.reply.id}:activity`,
  }) as Activity
  return { status: "created", record }
}

async function findOrCreateReviewTask(
  input: BareRedditRunnerOptions & {
    pluginId: string
    thread: RedditThreadSnapshot
    reply: RedditReplySnapshot
    related: EntityRef[]
  },
): Promise<BareRedditWriteResult<Task>> {
  const replyId = input.reply.name ?? input.reply.id
  const externalRef: ExternalRef = {
    system: "reddit",
    id: `review:${replyId}`,
  }
  const existing = await findOneByExternalRef(input, "task", externalRef)
  if (existing) return { status: "matched", record: existing }

  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "task.create",
    input: createRedditReviewTaskInput({
      workspaceId: input.workspaceId,
      thread: input.thread,
      reply: input.reply,
      related: input.related,
      includePermalink: input.includePermalink,
    }),
    idempotencyKey: `reddit:reply:${replyId}:review-task`,
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
    throw new BareRedditPluginError(
      "reddit.external_ref_ambiguous",
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
  throw new BareRedditPluginError(
    "reddit.capability_not_approved",
    `Reddit plugin capability is not approved: ${capability}`,
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
