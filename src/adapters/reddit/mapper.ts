import type {
  Activity,
  Collection,
  CreateInput,
  EntityRef,
  ExternalRef,
  Task,
} from "../../types.ts"
import type { RedditReplySnapshot, RedditThreadSnapshot } from "./api.ts"

export const REDDIT_EXTERNAL_REF_SYSTEM = "reddit"

export function redditThreadExternalRef(
  thread: Pick<RedditThreadSnapshot, "id" | "permalink">,
): ExternalRef {
  return compactObject({
    system: REDDIT_EXTERNAL_REF_SYSTEM,
    id: `thread:${thread.id}`,
    url: thread.permalink,
    kind: "canonical",
  })
}

export function redditReplyExternalRef(
  reply: Pick<RedditReplySnapshot, "id" | "name" | "permalink">,
): ExternalRef {
  return compactObject({
    system: REDDIT_EXTERNAL_REF_SYSTEM,
    id: `reply:${reply.name ?? reply.id}`,
    url: reply.permalink,
    kind: "dedupe",
  })
}

export function createRedditThreadCollectionInput(input: {
  workspaceId: string
  thread: RedditThreadSnapshot
  related?: EntityRef[]
  includePermalink?: boolean
}): CreateInput<Collection> {
  return {
    workspaceId: input.workspaceId,
    title: redditThreadTitle(input.thread),
    kind: "reddit.thread",
    status: "open",
    related: input.related,
    source: "plugin",
    externalRefs: [
      redditThreadExternalRef({
        ...input.thread,
        permalink: input.includePermalink ? input.thread.permalink : undefined,
      }),
    ],
    custom: {
      reddit: compactObject({
        threadId: input.thread.id,
        kind: input.thread.kind,
        subreddit: input.thread.subreddit,
        authorName: input.thread.authorName,
        permalink: input.includePermalink ? input.thread.permalink : undefined,
        rawPayloadStoredInKernel: false,
      }),
    },
  }
}

export function createRedditReplyActivityInput(input: {
  workspaceId: string
  thread: RedditThreadSnapshot
  reply: RedditReplySnapshot
  related?: EntityRef[]
  includePermalink?: boolean
}): CreateInput<Activity> {
  return {
    workspaceId: input.workspaceId,
    kind: "message",
    subject: `Reddit reply: ${redditThreadTitle(input.thread)}`,
    body: normalizeBody(input.reply.body) ?? "Reddit reply observed.",
    occurredAt: input.reply.occurredAt,
    direction: input.reply.direction ?? "inbound",
    related: input.related,
    source: "plugin",
    externalRefs: [
      redditReplyExternalRef({
        ...input.reply,
        permalink: input.includePermalink ? input.reply.permalink : undefined,
      }),
      redditThreadExternalRef({
        ...input.thread,
        permalink: input.includePermalink ? input.thread.permalink : undefined,
      }),
    ],
    custom: {
      reddit: compactObject({
        threadId: input.thread.id,
        replyId: input.reply.name ?? input.reply.id,
        parentId: input.reply.parentId,
        kind: input.thread.kind,
        subreddit: input.thread.subreddit,
        authorName: input.reply.authorName,
        score: input.reply.score,
        permalink: input.includePermalink ? input.reply.permalink : undefined,
        observeOnly: true,
        rawPayloadStoredInKernel: false,
      }),
    },
  }
}

export function createRedditReviewTaskInput(input: {
  workspaceId: string
  thread: RedditThreadSnapshot
  reply: RedditReplySnapshot
  related?: EntityRef[]
  includePermalink?: boolean
}): CreateInput<Task> {
  const author = input.reply.authorName ? ` from u/${input.reply.authorName}` : ""
  return {
    workspaceId: input.workspaceId,
    title: `Review Reddit reply${author}`,
    body: normalizeBody(input.reply.body),
    status: "todo",
    priority: "normal",
    related: input.related,
    source: "plugin",
    externalRefs: [
      {
        ...redditReplyExternalRef({
          ...input.reply,
          permalink: input.includePermalink ? input.reply.permalink : undefined,
        }),
        id: `review:${input.reply.name ?? input.reply.id}`,
      },
    ],
    custom: {
      reddit: compactObject({
        threadId: input.thread.id,
        replyId: input.reply.name ?? input.reply.id,
        subreddit: input.thread.subreddit,
        permalink: input.includePermalink ? input.reply.permalink : undefined,
      }),
    },
  }
}

export function redditThreadTitle(thread: RedditThreadSnapshot): string {
  return thread.title?.trim() || `Reddit ${thread.kind} thread`
}

function normalizeBody(value: string | undefined): string | undefined {
  const body = value?.replace(/\s+/g, " ").trim()
  return body ? body : undefined
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
