export type RedditThreadKind = "submission" | "comment"

export type RedditWatchedThread = {
  threadId: string
  kind: RedditThreadKind
  title?: string
  subreddit?: string
  authorName?: string
  permalink?: string
  lastSeenAt?: string | null
}

export type RedditReplySnapshot = {
  id: string
  name?: string
  threadId: string
  parentId?: string
  authorName?: string
  body?: string
  permalink?: string
  occurredAt: string
  direction?: "inbound" | "outbound"
  score?: number
  requiresReview?: boolean
}

export type RedditThreadSnapshot = {
  id: string
  kind: RedditThreadKind
  title?: string
  subreddit?: string
  authorName?: string
  permalink?: string
  updatedAt?: string
  replies: RedditReplySnapshot[]
}

export type RedditFetchThreadInput = {
  thread: RedditWatchedThread
  since?: string | null
}

export type RedditApiClient = {
  fetchThread(input: RedditFetchThreadInput): Promise<RedditThreadSnapshot>
}

export function createStaticRedditApiClient(threads: RedditThreadSnapshot[]): RedditApiClient {
  const byId = new Map(threads.map((thread) => [thread.id, thread]))
  return {
    async fetchThread(input) {
      const thread = byId.get(input.thread.threadId)
      if (!thread) {
        return {
          id: input.thread.threadId,
          kind: input.thread.kind,
          title: input.thread.title,
          subreddit: input.thread.subreddit,
          authorName: input.thread.authorName,
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
