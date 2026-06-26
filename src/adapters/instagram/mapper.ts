import type {
  Activity,
  Collection,
  CreateInput,
  EntityRef,
  ExternalRef,
  Task,
} from "../../types.ts"
import type { InstagramReplySnapshot, InstagramThreadSnapshot } from "./api.ts"

export const INSTAGRAM_EXTERNAL_REF_SYSTEM = "instagram"

export function instagramThreadExternalRef(
  thread: Pick<InstagramThreadSnapshot, "id" | "permalink">,
): ExternalRef {
  return compactObject({
    system: INSTAGRAM_EXTERNAL_REF_SYSTEM,
    id: `thread:${thread.id}`,
    url: thread.permalink,
    kind: "canonical",
  })
}

export function instagramReplyExternalRef(
  reply: Pick<InstagramReplySnapshot, "id" | "permalink">,
): ExternalRef {
  return compactObject({
    system: INSTAGRAM_EXTERNAL_REF_SYSTEM,
    id: `reply:${reply.id}`,
    url: reply.permalink,
    kind: "dedupe",
  })
}

export function createInstagramThreadCollectionInput(input: {
  workspaceId: string
  thread: InstagramThreadSnapshot
  related?: EntityRef[]
  includePermalink?: boolean
}): CreateInput<Collection> {
  return {
    workspaceId: input.workspaceId,
    title: instagramThreadTitle(input.thread),
    kind: "instagram.thread",
    status: "open",
    related: input.related,
    source: "plugin",
    externalRefs: [
      instagramThreadExternalRef({
        ...input.thread,
        permalink: input.includePermalink ? input.thread.permalink : undefined,
      }),
    ],
    custom: {
      instagram: compactObject({
        threadId: input.thread.id,
        kind: input.thread.kind,
        accountId: input.thread.accountId,
        mediaId: input.thread.mediaId,
        commentId: input.thread.commentId,
        permalink: input.includePermalink ? input.thread.permalink : undefined,
        rawPayloadStoredInKernel: false,
      }),
    },
  }
}

export function createInstagramReplyActivityInput(input: {
  workspaceId: string
  thread: InstagramThreadSnapshot
  reply: InstagramReplySnapshot
  related?: EntityRef[]
  includePermalink?: boolean
}): CreateInput<Activity> {
  return {
    workspaceId: input.workspaceId,
    kind: "message",
    subject: `Instagram reply: ${instagramThreadTitle(input.thread)}`,
    body: normalizeBody(input.reply.text) ?? "Instagram reply observed.",
    occurredAt: input.reply.occurredAt,
    direction: input.reply.direction ?? "inbound",
    related: input.related,
    source: "plugin",
    externalRefs: [
      instagramReplyExternalRef({
        ...input.reply,
        permalink: input.includePermalink ? input.reply.permalink : undefined,
      }),
      instagramThreadExternalRef({
        ...input.thread,
        permalink: input.includePermalink ? input.thread.permalink : undefined,
      }),
    ],
    custom: {
      instagram: compactObject({
        threadId: input.thread.id,
        replyId: input.reply.id,
        parentId: input.reply.parentId,
        kind: input.thread.kind,
        authorUsername: input.reply.authorUsername,
        permalink: input.includePermalink ? input.reply.permalink : undefined,
        observeOnly: true,
        rawPayloadStoredInKernel: false,
      }),
    },
  }
}

export function createInstagramReviewTaskInput(input: {
  workspaceId: string
  thread: InstagramThreadSnapshot
  reply: InstagramReplySnapshot
  related?: EntityRef[]
  includePermalink?: boolean
}): CreateInput<Task> {
  const author = input.reply.authorUsername ? ` from @${input.reply.authorUsername}` : ""
  return {
    workspaceId: input.workspaceId,
    title: `Review Instagram reply${author}`,
    body: normalizeBody(input.reply.text),
    status: "todo",
    priority: "normal",
    related: input.related,
    source: "plugin",
    externalRefs: [
      {
        ...instagramReplyExternalRef({
          ...input.reply,
          permalink: input.includePermalink ? input.reply.permalink : undefined,
        }),
        id: `review:${input.reply.id}`,
      },
    ],
    custom: {
      instagram: compactObject({
        threadId: input.thread.id,
        replyId: input.reply.id,
        kind: input.thread.kind,
        permalink: input.includePermalink ? input.reply.permalink : undefined,
      }),
    },
  }
}

export function instagramThreadTitle(thread: InstagramThreadSnapshot): string {
  return thread.title?.trim() || `Instagram ${thread.kind} thread`
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
