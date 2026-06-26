import { BARE_GMAIL_PLUGIN_ID, processBareGmailMessage } from "./runner.ts"
import {
  type ExtensionHost,
  ExtensionHostError,
  type GmailClassificationBucket,
  type GmailClassifierSettings,
  type GmailMessageSnapshot,
} from "../../index.ts"
import type { BareGmailProcessMessageResult } from "./runner.ts"

export const BARE_GMAIL_SYNC_ID = "gmail.message-sync"

export type BareGmailSyncCursorRef = {
  workspaceId: string
  pluginId: string
  syncId: string
}

export type BareGmailSyncStateStore = {
  getCursor(ref: BareGmailSyncCursorRef): Promise<string | null>
  setCursor(ref: BareGmailSyncCursorRef & { cursor: string }): Promise<void>
}

export type BareGmailListChangedMessagesInput = {
  workspaceId: string
  cursor?: string
  limit?: number
}

export type BareGmailSyncBatch = {
  messages: GmailMessageSnapshot[]
  nextCursor?: string
}

export type BareGmailSyncTransport = {
  listChangedMessages(input: BareGmailListChangedMessagesInput): Promise<BareGmailSyncBatch>
}

export type StaticBareGmailSyncBatch = BareGmailSyncBatch & {
  cursor?: string | null
}

export type StaticBareGmailSyncTransport = BareGmailSyncTransport & {
  calls: BareGmailListChangedMessagesInput[]
}

export type BareGmailSyncOptions = {
  host: ExtensionHost
  workspaceId: string
  transport: BareGmailSyncTransport
  state: BareGmailSyncStateStore
  pluginId?: string
  syncId?: string
  limit?: number
  classifierSettings?: GmailClassifierSettings
  writeBuckets?: GmailClassificationBucket[]
  createFollowUpTasks?: boolean
}

export type BareGmailSyncRunResult = {
  cursorBefore: string | null
  cursorAfter: string | null
  fetched: number
  processed: number
  promoted: number
  suggested: number
  observed: number
  ignored: number
  collectionsCreated: number
  activitiesCreated: number
  tasksCreated: number
  results: BareGmailProcessMessageResult[]
}

export function createMemoryBareGmailSyncStateStore(): BareGmailSyncStateStore {
  const cursors = new Map<string, string>()

  return {
    async getCursor(ref) {
      return cursors.get(syncCursorKey(ref)) ?? null
    },
    async setCursor(ref) {
      cursors.set(syncCursorKey(ref), ref.cursor)
    },
  }
}

export function createStaticBareGmailSyncTransport(
  batches: StaticBareGmailSyncBatch[],
): StaticBareGmailSyncTransport {
  const calls: BareGmailListChangedMessagesInput[] = []

  return {
    calls,
    async listChangedMessages(input) {
      calls.push({ ...input })
      const cursor = input.cursor ?? null
      const batch = batches.find((candidate) => (candidate.cursor ?? null) === cursor)
      if (!batch) return { messages: [], nextCursor: input.cursor }
      return {
        messages: batch.messages,
        nextCursor: batch.nextCursor,
      }
    },
  }
}

export async function syncBareGmailMessages(
  input: BareGmailSyncOptions,
): Promise<BareGmailSyncRunResult> {
  const pluginId = input.pluginId ?? BARE_GMAIL_PLUGIN_ID
  const syncId = input.syncId ?? BARE_GMAIL_SYNC_ID
  assertSyncApproved(input.host, input.workspaceId, pluginId)

  const cursorRef = { workspaceId: input.workspaceId, pluginId, syncId }
  const cursorBefore = await input.state.getCursor(cursorRef)
  const batch = await input.transport.listChangedMessages({
    workspaceId: input.workspaceId,
    cursor: cursorBefore ?? undefined,
    limit: input.limit,
  })
  const results: BareGmailProcessMessageResult[] = []

  for (const message of batch.messages) {
    results.push(
      await processBareGmailMessage({
        host: input.host,
        workspaceId: input.workspaceId,
        pluginId,
        message,
        classifierSettings: input.classifierSettings,
        writeBuckets: input.writeBuckets,
        createFollowUpTask: input.createFollowUpTasks,
      }),
    )
  }

  if (batch.nextCursor !== undefined) {
    await input.state.setCursor({ ...cursorRef, cursor: batch.nextCursor })
  }

  return {
    cursorBefore,
    cursorAfter: batch.nextCursor ?? cursorBefore,
    fetched: batch.messages.length,
    processed: results.length,
    promoted: countResults(results, "promoted"),
    suggested: countResults(results, "suggested"),
    observed: countResults(results, "observed"),
    ignored: countResults(results, "ignored"),
    collectionsCreated: countCreated(results, "collection"),
    activitiesCreated: countCreated(results, "activity"),
    tasksCreated: countCreated(results, "task"),
    results,
  }
}

function assertSyncApproved(host: ExtensionHost, workspaceId: string, pluginId: string): void {
  const state = host.getPluginState({ workspaceId, pluginId })
  if (!state) {
    throw new ExtensionHostError(
      "extension.plugin_not_installed",
      `Plugin is not installed in workspace: ${pluginId}`,
      "pluginId",
    )
  }
  if (!state.enabled) {
    throw new ExtensionHostError(
      "extension.plugin_disabled",
      `Plugin is disabled in workspace: ${pluginId}`,
      "pluginId",
    )
  }
  if (!state.approvedCapabilities.includes("plugin:sync")) {
    throw new ExtensionHostError(
      "extension.capability_not_approved",
      "Plugin capability is not approved: plugin:sync",
      "capabilities",
    )
  }
}

function countResults(
  results: BareGmailProcessMessageResult[],
  action: BareGmailProcessMessageResult["action"],
): number {
  return results.filter((result) => result.action === action).length
}

function countCreated(
  results: BareGmailProcessMessageResult[],
  kind: "collection" | "activity" | "task",
): number {
  return results.filter((result) => result[kind]?.status === "created").length
}

function syncCursorKey(ref: BareGmailSyncCursorRef): string {
  return `${ref.workspaceId}:${ref.pluginId}:${ref.syncId}`
}
