import type { RedditWatchedThread } from "./api.ts"

export type BareRedditStateRef = {
  workspaceId: string
  pluginId: string
  syncId: string
}

export type BareRedditThreadState = {
  thread: RedditWatchedThread
  seenReplyIds: string[]
  lastSeenAt: string | null
}

export type BareRedditPluginStateStore = {
  watchThread(ref: BareRedditStateRef & { thread: RedditWatchedThread }): Promise<void>
  listWatchedThreads(ref: BareRedditStateRef): Promise<BareRedditThreadState[]>
  hasSeenReply(ref: BareRedditStateRef & { threadId: string; replyId: string }): Promise<boolean>
  markReplySeen(
    ref: BareRedditStateRef & { threadId: string; replyId: string; occurredAt: string },
  ): Promise<void>
}

export function createMemoryBareRedditPluginStateStore(): BareRedditPluginStateStore {
  const threads = new Map<string, BareRedditThreadState>()

  return {
    async watchThread(ref) {
      const key = threadKey({ ...ref, threadId: ref.thread.threadId })
      const existing = threads.get(key)
      threads.set(key, {
        thread: {
          ...ref.thread,
          lastSeenAt: ref.thread.lastSeenAt ?? existing?.lastSeenAt ?? null,
        },
        seenReplyIds: existing?.seenReplyIds ?? [],
        lastSeenAt: ref.thread.lastSeenAt ?? existing?.lastSeenAt ?? null,
      })
    },
    async listWatchedThreads(ref) {
      const prefix = `${scopeKey(ref)}:`
      return [...threads.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => ({
          thread: value.thread,
          seenReplyIds: [...value.seenReplyIds],
          lastSeenAt: value.lastSeenAt,
        }))
    },
    async hasSeenReply(ref) {
      return threads.get(threadKey(ref))?.seenReplyIds.includes(ref.replyId) ?? false
    },
    async markReplySeen(ref) {
      const key = threadKey(ref)
      const existing = threads.get(key)
      const seen = new Set(existing?.seenReplyIds ?? [])
      seen.add(ref.replyId)
      threads.set(key, {
        thread: existing?.thread ?? { threadId: ref.threadId, kind: "submission" },
        seenReplyIds: [...seen],
        lastSeenAt: maxDate(existing?.lastSeenAt ?? null, ref.occurredAt),
      })
    },
  }
}

function scopeKey(ref: BareRedditStateRef): string {
  return `${ref.workspaceId}:${ref.pluginId}:${ref.syncId}`
}

function threadKey(ref: BareRedditStateRef & { threadId: string }): string {
  return `${scopeKey(ref)}:${ref.threadId}`
}

function maxDate(left: string | null, right: string): string {
  return !left || right > left ? right : left
}
