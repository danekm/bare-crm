import { assertEquals } from "jsr:@std/assert"
import { createCrmKernel, createExtensionHost, type CrmKernel } from "../src/index.ts"
import {
  bareRedditPluginManifest,
  createBareRedditRunner,
  createMemoryBareRedditPluginStateStore,
  createStaticRedditApiClient,
  installBareRedditPlugin,
  type RedditThreadSnapshot,
  syncBareRedditThreads,
} from "../src/adapters/reddit/mod.ts"

const workspaceId = "workspace_1"

Deno.test("Bare Reddit plugin manifest is valid and installable per workspace", () => {
  const { host } = setup()

  const state = installBareRedditPlugin(host, { workspaceId })

  assertEquals(bareRedditPluginManifest.id, "bare.reddit")
  assertEquals(state.pluginId, "bare.reddit")
  assertEquals(host.listCollectionProfiles({ workspaceId }).map((profile) => profile.id), [
    "reddit.thread",
  ])
})

Deno.test("Bare Reddit runner saves observed replies and optional review tasks", async () => {
  const { crm, host } = setup()
  installBareRedditPlugin(host, { workspaceId })
  const runner = createBareRedditRunner({
    host,
    workspaceId,
    includePermalink: true,
    createReviewTasks: true,
  })

  const result = await runner.processThread({ thread: baseThread })

  assertEquals(result.action, "observed")
  assertEquals(result.collection.status, "created")
  assertEquals(result.collection.record.kind, "reddit.thread")
  assertEquals(result.collection.record.externalRefs, [{
    system: "reddit",
    id: "thread:t3_launch1",
    url: "https://reddit.com/r/crm/comments/launch1",
    kind: "canonical",
  }])
  assertEquals(result.activities.length, 1)
  assertEquals(result.activities[0].status, "created")
  assertEquals(result.activities[0].record.kind, "message")
  assertEquals(result.activities[0].record.direction, "inbound")
  assertEquals(result.activities[0].record.body, "Can this follow public complaint threads?")
  assertEquals(result.activities[0].record.custom?.reddit, {
    threadId: "t3_launch1",
    replyId: "t1_reply1",
    parentId: "t3_launch1",
    kind: "submission",
    subreddit: "crm",
    authorName: "ada_ops",
    score: 4,
    permalink: "https://reddit.com/r/crm/comments/launch1/comment/reply1",
    observeOnly: true,
    rawPayloadStoredInKernel: false,
  })
  assertEquals(result.tasks.length, 1)
  assertEquals(result.tasks[0].record.title, "Review Reddit reply from u/ada_ops")
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Reddit runner is idempotent by thread and reply refs", async () => {
  const { crm, host } = setup()
  installBareRedditPlugin(host, { workspaceId })
  const runner = createBareRedditRunner({ host, workspaceId, createReviewTasks: true })

  const first = await runner.processThread({ thread: baseThread })
  const second = await runner.processThread({ thread: baseThread })

  assertEquals(first.collection.status, "created")
  assertEquals(second.collection.status, "matched")
  assertEquals(first.activities[0].status, "created")
  assertEquals(second.activities[0].status, "matched")
  assertEquals(first.tasks[0].status, "created")
  assertEquals(second.tasks[0].status, "matched")
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Reddit sync follows watched threads and advances adapter-owned state", async () => {
  const { crm, host } = setup()
  installBareRedditPlugin(host, { workspaceId })
  const state = createMemoryBareRedditPluginStateStore()
  const client = createStaticRedditApiClient([baseThread])

  const first = await syncBareRedditThreads({
    host,
    workspaceId,
    client,
    state,
    watchedThreads: [{
      threadId: baseThread.id,
      kind: baseThread.kind,
      title: baseThread.title,
      subreddit: baseThread.subreddit,
      permalink: baseThread.permalink,
    }],
    createReviewTasks: true,
  })
  const second = await syncBareRedditThreads({
    host,
    workspaceId,
    client,
    state,
    createReviewTasks: true,
  })

  assertEquals(first, {
    watched: 1,
    fetched: 1,
    repliesSeen: 2,
    activitiesCreated: 1,
    tasksCreated: 1,
  })
  assertEquals(second, {
    watched: 1,
    fetched: 1,
    repliesSeen: 0,
    activitiesCreated: 0,
    tasksCreated: 0,
  })
  assertEquals(await countRecords(crm, "activity"), 1)
})

const baseThread: RedditThreadSnapshot = {
  id: "t3_launch1",
  kind: "submission",
  title: "Bare CRM thread tracking",
  subreddit: "crm",
  authorName: "barecrm",
  permalink: "https://reddit.com/r/crm/comments/launch1",
  updatedAt: "2026-06-18T15:05:00Z",
  replies: [
    {
      id: "reply1",
      name: "t1_reply1",
      threadId: "t3_launch1",
      parentId: "t3_launch1",
      authorName: "ada_ops",
      body: "Can this follow public complaint threads?",
      permalink: "https://reddit.com/r/crm/comments/launch1/comment/reply1",
      occurredAt: "2026-06-18T15:00:00Z",
      direction: "inbound",
      score: 4,
      requiresReview: true,
    },
    {
      id: "reply_self",
      name: "t1_self",
      threadId: "t3_launch1",
      authorName: "barecrm",
      body: "Thanks for asking.",
      occurredAt: "2026-06-18T15:01:00Z",
      direction: "outbound",
    },
  ],
}

function setup() {
  const crm = createCrmKernel({
    now: () => new Date("2026-06-18T16:00:00.000Z"),
    id: createDeterministicId(),
  })
  const host = createExtensionHost({
    crm,
    now: () => new Date("2026-06-18T16:00:00.000Z"),
  })
  return { crm, host }
}

async function countRecords(crm: CrmKernel, type: "activity" | "task"): Promise<number> {
  const records = await crm.read("record.search", { workspaceId, type, limit: 100 })
  return records.length
}

function createDeterministicId(): () => string {
  let next = 1
  return () => `id_${next++}`
}
