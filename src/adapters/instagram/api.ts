export type InstagramThreadKind = "media.comments" | "mention" | "dm"

export type InstagramWatchedThread = {
  threadId: string
  kind: InstagramThreadKind
  title?: string
  accountId?: string
  mediaId?: string
  commentId?: string
  permalink?: string
  lastSeenAt?: string | null
}

export type InstagramReplySnapshot = {
  id: string
  threadId: string
  parentId?: string
  authorId?: string
  authorUsername?: string
  text?: string
  permalink?: string
  occurredAt: string
  direction?: "inbound" | "outbound"
  requiresReview?: boolean
}

export type InstagramThreadSnapshot = {
  id: string
  kind: InstagramThreadKind
  title?: string
  accountId?: string
  mediaId?: string
  commentId?: string
  permalink?: string
  updatedAt?: string
  replies: InstagramReplySnapshot[]
}

export type InstagramFetchThreadInput = {
  thread: InstagramWatchedThread
  since?: string | null
}

export type InstagramApiClient = {
  fetchThread(input: InstagramFetchThreadInput): Promise<InstagramThreadSnapshot>
}

export function createStaticInstagramApiClient(
  threads: InstagramThreadSnapshot[],
): InstagramApiClient {
  const byId = new Map(threads.map((thread) => [thread.id, thread]))
  return {
    async fetchThread(input) {
      const thread = byId.get(input.thread.threadId)
      if (!thread) {
        return {
          id: input.thread.threadId,
          kind: input.thread.kind,
          title: input.thread.title,
          accountId: input.thread.accountId,
          mediaId: input.thread.mediaId,
          commentId: input.thread.commentId,
          permalink: input.thread.permalink,
          replies: [],
        }
      }
      return {
        ...thread,
        replies: thread.replies.filter((reply) => !input.since || reply.occurredAt > input.since),
      }
    },
  }
}
