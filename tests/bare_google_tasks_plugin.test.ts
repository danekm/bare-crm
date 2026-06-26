import { assertEquals } from "jsr:@std/assert"
import { createCrmKernel, createExtensionHost, type CrmKernel, type Task } from "../src/index.ts"
import {
  bareGoogleTasksPluginManifest,
  createBareGoogleTasksRunner,
  createMemoryBareGoogleTasksStateStore,
  type GoogleTask,
  type GoogleTasksApiClient,
  type GoogleTasksInsertInput,
  type GoogleTasksListInput,
  type GoogleTasksPatchInput,
  installBareGoogleTasksPlugin,
} from "../src/adapters/google-tasks/mod.ts"

const workspaceId = "workspace_1"
const taskListId = "google_list_1"

Deno.test("Bare Google Tasks plugin manifest is valid and installable per workspace", () => {
  const { host } = setup()

  const state = installBareGoogleTasksPlugin(host, { workspaceId })

  assertEquals(bareGoogleTasksPluginManifest.id, "bare.google-tasks")
  assertEquals(state.pluginId, "bare.google-tasks")
  assertEquals(state.manifest.contributes.syncs?.[0].direction, "bidirectional")
  assertEquals(
    host.getEventCursor({
      workspaceId,
      pluginId: "bare.google-tasks",
      subscriptionId: "google-tasks.task-sync",
    })?.listensTo,
    ["task.created", "task.updated", "task.archived"],
  )
})

Deno.test("Bare Google Tasks runner pushes CRM tasks to Google and stamps external refs", async () => {
  const { crm, host } = setup()
  installBareGoogleTasksPlugin(host, { workspaceId })
  const client = createFakeGoogleTasksClient()
  const state = createMemoryBareGoogleTasksStateStore()
  const runner = createBareGoogleTasksRunner({
    host,
    workspaceId,
    client,
    state,
    taskListId,
    now: fixedNow,
  })
  const task = await createCrmTask(crm)

  const result = await runner.pushTask({ task })

  assertEquals(result.action, "created")
  assertEquals(result.googleTask.title, "Send SOC2 packet to Ada")
  assertEquals(result.googleTask.status, "needsAction")
  assertEquals(result.googleTask.due, "2026-06-18T00:00:00.000Z")
  assertEquals(result.googleTask.notes?.includes("Bare CRM Task: task_1"), true)
  assertEquals(result.link.crmTaskId, "task_1")
  assertEquals(result.link.googleTaskId, result.googleTask.id)

  const updated = await crm.read("record.get", { workspaceId, type: "task", id: task.id }) as Task
  assertEquals(updated.externalRefs?.[0], {
    system: "google-tasks",
    id: `${taskListId}:${result.googleTask.id}`,
    kind: "canonical",
  })
  assertEquals(updated.custom?.googleTasks, {
    taskListId,
    taskId: result.googleTask.id,
    updated: result.googleTask.updated,
  })
})

Deno.test("Bare Google Tasks runner pulls Google completion back into CRM without overwriting CRM context", async () => {
  const { crm, host } = setup()
  installBareGoogleTasksPlugin(host, { workspaceId })
  const client = createFakeGoogleTasksClient()
  const state = createMemoryBareGoogleTasksStateStore()
  const runner = createBareGoogleTasksRunner({
    host,
    workspaceId,
    client,
    state,
    taskListId,
    now: fixedNow,
  })
  const task = await createCrmTask(crm)
  const pushed = await runner.pushTask({ task })
  const completed = client.setTask({
    ...pushed.googleTask,
    title: "Personal edited title should not win",
    notes: "Personal note edit should not replace CRM body",
    status: "completed",
    completed: "2026-06-18T12:00:00.000Z",
    updated: "2026-06-18T12:00:00.000Z",
  })

  const result = await runner.pullTask({ googleTask: completed })

  assertEquals(result.action, "updated")
  const updated = await crm.read("record.get", { workspaceId, type: "task", id: task.id }) as Task
  assertEquals(updated.status, "done")
  assertEquals(updated.title, "Send SOC2 packet to Ada")
  assertEquals(updated.body, "Mentioned in the Granola meeting.")
  assertEquals(updated.custom?.googleTasks, {
    taskListId,
    taskId: completed.id,
    updated: "2026-06-18T12:00:00.000Z",
  })
})

Deno.test("Bare Google Tasks runner maps deleted Google tasks to canceled CRM tasks", async () => {
  const { crm, host } = setup()
  installBareGoogleTasksPlugin(host, { workspaceId })
  const client = createFakeGoogleTasksClient()
  const state = createMemoryBareGoogleTasksStateStore()
  const runner = createBareGoogleTasksRunner({
    host,
    workspaceId,
    client,
    state,
    taskListId,
    now: fixedNow,
  })
  const task = await createCrmTask(crm)
  const pushed = await runner.pushTask({ task })
  const deleted = client.setTask({
    ...pushed.googleTask,
    deleted: true,
    updated: "2026-06-18T13:00:00.000Z",
  })

  await runner.pullTask({ googleTask: deleted })

  const updated = await crm.read("record.get", { workspaceId, type: "task", id: task.id }) as Task
  assertEquals(updated.status, "canceled")
})

Deno.test("Bare Google Tasks sync pushes selected CRM tasks and ignores unrelated personal tasks", async () => {
  const { crm, host } = setup()
  installBareGoogleTasksPlugin(host, { workspaceId })
  const client = createFakeGoogleTasksClient()
  client.setTask({
    id: "personal_1",
    title: "Buy milk",
    status: "needsAction",
    updated: "2026-06-18T08:00:00.000Z",
  })
  const state = createMemoryBareGoogleTasksStateStore()
  const runner = createBareGoogleTasksRunner({
    host,
    workspaceId,
    client,
    state,
    taskListId,
    now: fixedNow,
  })
  const task = await createCrmTask(crm)

  const result = await runner.sync({ pushTasks: [task] })

  assertEquals(result.pushed, 1)
  assertEquals(result.pulled, 1)
  assertEquals(result.ignored, 1)
  assertEquals(result.updatedMinAfter, "2026-06-18T08:00:00.000Z")
  assertEquals(
    await state.getSyncState({
      workspaceId,
      pluginId: "bare.google-tasks",
      taskListId,
    }),
    {
      updatedMin: "2026-06-18T08:00:00.000Z",
      pageToken: null,
    },
  )
})

function setup() {
  const crm = createCrmKernel({
    now: fixedNow,
    id: createDeterministicId(),
  })
  const host = createExtensionHost({ crm, now: fixedNow })
  return { crm, host }
}

async function createCrmTask(crm: CrmKernel): Promise<Task> {
  return await crm.write("task.create", {
    workspaceId,
    id: "task_1",
    title: "Send SOC2 packet to Ada",
    body: "Mentioned in the Granola meeting.",
    status: "todo",
    dueAt: "2026-06-18T15:30:00.000Z",
    related: [{ type: "company", id: "company_acme" }],
  }) as Task
}

function createFakeGoogleTasksClient(): GoogleTasksApiClient & {
  setTask(task: GoogleTask): GoogleTask
} {
  const tasks = new Map<string, GoogleTask>()
  let next = 1

  return {
    async listTasks(input: GoogleTasksListInput) {
      const items = [...tasks.values()]
        .filter((task) => !input.updatedMin || !task.updated || task.updated >= input.updatedMin)
        .sort((a, b) => (a.updated ?? "").localeCompare(b.updated ?? ""))
      return { items }
    },
    async insertTask(input: GoogleTasksInsertInput) {
      const task: GoogleTask = {
        id: `google_task_${next++}`,
        title: input.task.title,
        notes: input.task.notes,
        status: input.task.status ?? "needsAction",
        due: input.task.due,
        completed: input.task.completed ?? undefined,
        updated: "2026-06-17T16:00:00.000Z",
      }
      tasks.set(task.id, task)
      return task
    },
    async patchTask(input: GoogleTasksPatchInput) {
      const current = tasks.get(input.taskId)
      const task: GoogleTask = {
        ...current,
        id: input.taskId,
        ...input.task,
        completed: input.task.completed === null ? undefined : input.task.completed,
        updated: "2026-06-17T17:00:00.000Z",
      }
      tasks.set(task.id, task)
      return task
    },
    async deleteTask(input) {
      const current = tasks.get(input.taskId)
      if (current) {
        tasks.set(input.taskId, {
          ...current,
          deleted: true,
          updated: "2026-06-17T18:00:00.000Z",
        })
      }
    },
    setTask(task: GoogleTask) {
      tasks.set(task.id, task)
      return task
    },
  }
}

function fixedNow(): Date {
  return new Date("2026-06-17T16:00:00.000Z")
}

function createDeterministicId(): () => string {
  let next = 1
  return () => `id_${next++}`
}
