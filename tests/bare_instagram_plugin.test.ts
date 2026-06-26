import { assertEquals } from "jsr:@std/assert"
import { createCrmKernel, createExtensionHost, type CrmKernel } from "../src/index.ts"
import {
  bareInstagramPluginManifest,
  createBareInstagramRunner,
  createMemoryBareInstagramPluginStateStore,
  createStaticInstagramApiClient,
  type InstagramThreadSnapshot,
  installBareInstagramPlugin,
  syncBareInstagramThreads,
} from "../src/adapters/instagram/mod.ts"

const workspaceId = "workspace_1"

Deno.test("Bare Instagram plugin manifest is valid and installable per workspace", () => {
  const { host } = setup()

  const state = installBareInstagramPlugin(host, { workspaceId })

  assertEquals(bareInstagramPluginManifest.id, "bare.instagram")
  assertEquals(state.pluginId, "bare.instagram")
  assertEquals(host.listCollectionProfiles({ workspaceId }).map((profile) => profile.id), [
    "instagram.thread",
  ])
})

Deno.test("Bare Instagram runner saves observed replies and optional review tasks", async () => {
  const { crm, host } = setup()
  installBareInstagramPlugin(host, { workspaceId })
  const runner = createBareInstagramRunner({
    host,
    workspaceId,
    includePermalink: true,
    createReviewTasks: true,
  })

  const result = await runner.processThread({ thread: baseThread })

  assertEquals(result.action, "observed")
  assertEquals(result.collection.status, "created")
  assertEquals(result.collection.record.kind, "instagram.thread")
  assertEquals(result.collection.record.externalRefs, [{
    system: "instagram",
    id: "thread:ig_thread_1",
    url: "https://instagram.com/p/acme-launch",
    kind: "canonical",
  }])
  assertEquals(result.activities.length, 1)
  assertEquals(result.activities[0].status, "created")
  assertEquals(result.activities[0].record.kind, "message")
  assertEquals(result.activities[0].record.direction, "inbound")
  assertEquals(result.activities[0].record.body, "Is this available for agencies?")
  assertEquals(result.activities[0].record.related?.[0], {
    type: "collection",
    id: result.collection.record.id,
  })
  assertEquals(result.activities[0].record.custom?.instagram, {
    threadId: "ig_thread_1",
    replyId: "ig_reply_1",
    kind: "media.comments",
    authorUsername: "ada.agency",
    permalink: "https://instagram.com/p/acme-launch/c/ig_reply_1",
    observeOnly: true,
    rawPayloadStoredInKernel: false,
  })
  assertEquals(result.tasks.length, 1)
  assertEquals(result.tasks[0].record.title, "Review Instagram reply from @ada.agency")
  assertEquals(await countRecords(crm, "activity"), 1)
  assertEquals(await countRecords(crm, "task"), 1)
})

Deno.test("Bare Instagram runner is idempotent by thread and reply refs", async () => {
  const { crm, host } = setup()
  installBareInstagramPlugin(host, { workspaceId })
  const runner = createBareInstagramRunner({ host, workspaceId, createReviewTasks: true })

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

Deno.test("Bare Instagram sync follows watched threads and advances adapter-owned state", async () => {
  const { crm, host } = setup()
  installBareInstagramPlugin(host, { workspaceId })
  const state = createMemoryBareInstagramPluginStateStore()
  const client = createStaticInstagramApiClient([baseThread])

  const first = await syncBareInstagramThreads({
    host,
    workspaceId,
    client,
    state,
    watchedThreads: [{
      threadId: baseThread.id,
      kind: baseThread.kind,
      title: baseThread.title,
      permalink: baseThread.permalink,
    }],
    createReviewTasks: true,
  })
  const second = await syncBareInstagramThreads({
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

const baseThread: InstagramThreadSnapshot = {
  id: "ig_thread_1",
  kind: "media.comments",
  title: "Acme launch post",
  accountId: "ig_account_1",
  mediaId: "ig_media_1",
  permalink: "https://instagram.com/p/acme-launch",
  updatedAt: "2026-06-18T15:05:00Z",
  replies: [
    {
      id: "ig_reply_1",
      threadId: "ig_thread_1",
      authorId: "ig_user_1",
      authorUsername: "ada.agency",
      text: "Is this available for agencies?",
      permalink: "https://instagram.com/p/acme-launch/c/ig_reply_1",
      occurredAt: "2026-06-18T15:00:00Z",
      direction: "inbound",
      requiresReview: true,
    },
    {
      id: "ig_reply_self",
      threadId: "ig_thread_1",
      authorUsername: "barecrm",
      text: "Thanks for asking.",
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
