import manifestJson from "./plugin.json" with { type: "json" }
import { validatePluginManifest } from "../../index.ts"
import type {
  ExtensionHost,
  ExtensionPluginState,
  PluginManifest,
  PluginRuntimeCapability,
  Task,
} from "../../index.ts"
import type { GoogleTask, GoogleTasksApiClient } from "./api.ts"
import {
  crmTaskToGoogleTaskWrite,
  extractCrmTaskIdFromGoogleTask,
  googleTaskExternalRef,
  googleTaskToCrmTaskPatch,
} from "./mapper.ts"
import type { BareGoogleTasksLink, BareGoogleTasksStateStore } from "./state.ts"

export const BARE_GOOGLE_TASKS_PLUGIN_ID = "bare.google-tasks"
export const BARE_GOOGLE_TASKS_SYNC_ID = "google-tasks.bidirectional-sync"

export const BARE_GOOGLE_TASKS_REQUIRED_CAPABILITIES: PluginRuntimeCapability[] = [
  "plugin:commands",
  "plugin:sync",
  "plugin:workflows",
  "network:external",
  "secrets:read",
  "crm:read:record.get",
  "crm:read:record.search",
  "crm:read:event.list",
  "crm:write:task.create",
  "crm:write:record.update",
]

export const bareGoogleTasksPluginManifest: PluginManifest = validatePluginManifest(manifestJson)

export type BareGoogleTasksInstallInput = {
  workspaceId: string
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type BareGoogleTasksRunnerOptions = {
  host: ExtensionHost
  workspaceId: string
  client: GoogleTasksApiClient
  state: BareGoogleTasksStateStore
  taskListId: string
  pluginId?: string
  now?: () => Date
}

export type BareGoogleTasksPushInput = {
  task: Task
}

export type BareGoogleTasksPullInput = {
  googleTask: GoogleTask
}

export type BareGoogleTasksPushResult = {
  action: "created" | "updated"
  googleTask: GoogleTask
  link: BareGoogleTasksLink
}

export type BareGoogleTasksPullResult =
  | { action: "ignored"; reason: "unlinked" | "missing_crm_task" }
  | { action: "updated"; task: Task; link: BareGoogleTasksLink }

export type BareGoogleTasksSyncInput = BareGoogleTasksRunnerOptions & {
  pushTasks?: Task[]
  maxResults?: number
  updatedMin?: string
}

export type BareGoogleTasksSyncResult = {
  pushed: number
  pulled: number
  ignored: number
  updatedMinBefore: string | null
  updatedMinAfter: string | null
}

export type BareGoogleTasksRunner = {
  pushTask(input: BareGoogleTasksPushInput): Promise<BareGoogleTasksPushResult>
  pullTask(input: BareGoogleTasksPullInput): Promise<BareGoogleTasksPullResult>
  sync(input?: { pushTasks?: Task[]; updatedMin?: string; maxResults?: number }): Promise<
    BareGoogleTasksSyncResult
  >
}

export class BareGoogleTasksPluginError extends Error {
  constructor(
    readonly code:
      | "google_tasks.capability_not_approved"
      | "google_tasks.crm_task_required",
    message: string,
  ) {
    super(message)
    this.name = "BareGoogleTasksPluginError"
  }
}

export function installBareGoogleTasksPlugin(
  host: ExtensionHost,
  input: BareGoogleTasksInstallInput,
): ExtensionPluginState {
  return host.installPlugin({
    workspaceId: input.workspaceId,
    manifest: bareGoogleTasksPluginManifest,
    approvedCapabilities: input.approvedCapabilities ?? BARE_GOOGLE_TASKS_REQUIRED_CAPABILITIES,
    enabled: input.enabled ?? true,
  })
}

export function createBareGoogleTasksRunner(
  options: BareGoogleTasksRunnerOptions,
): BareGoogleTasksRunner {
  return {
    pushTask(input) {
      return pushBareCrmTaskToGoogleTasks({ ...options, ...input })
    },
    pullTask(input) {
      return pullGoogleTaskToBareCrm({ ...options, ...input })
    },
    sync(input = {}) {
      return syncBareGoogleTasks({ ...options, ...input })
    },
  }
}

export async function pushBareCrmTaskToGoogleTasks(
  input: BareGoogleTasksRunnerOptions & BareGoogleTasksPushInput,
): Promise<BareGoogleTasksPushResult> {
  const pluginId = input.pluginId ?? BARE_GOOGLE_TASKS_PLUGIN_ID
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "network:external")
  if (input.task.type !== "task") {
    throw new BareGoogleTasksPluginError(
      "google_tasks.crm_task_required",
      "Google Tasks sync can only push CRM task records.",
    )
  }

  const link = await input.state.getLinkByCrmTaskId({
    workspaceId: input.workspaceId,
    pluginId,
    taskListId: input.taskListId,
    crmTaskId: input.task.id,
  })
  const write = crmTaskToGoogleTaskWrite(input.task, { taskListId: input.taskListId })
  const googleTask = link
    ? await input.client.patchTask({
      taskListId: input.taskListId,
      taskId: link.googleTaskId,
      task: write,
    })
    : await input.client.insertTask({
      taskListId: input.taskListId,
      task: write,
    })

  const nextLink = await saveLink(input, pluginId, input.task, googleTask)
  await stampCrmTaskWithGoogleRef(input, pluginId, input.task, googleTask)
  return {
    action: link ? "updated" : "created",
    googleTask,
    link: nextLink,
  }
}

export async function pullGoogleTaskToBareCrm(
  input: BareGoogleTasksRunnerOptions & BareGoogleTasksPullInput,
): Promise<BareGoogleTasksPullResult> {
  const pluginId = input.pluginId ?? BARE_GOOGLE_TASKS_PLUGIN_ID
  const link = await resolveGoogleTaskLink(input, pluginId, input.googleTask)
  if (!link) return { action: "ignored", reason: "unlinked" }

  const current = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.get",
    input: { workspaceId: input.workspaceId, type: "task", id: link.crmTaskId },
  })
  if (!current || current.type !== "task") return { action: "ignored", reason: "missing_crm_task" }

  const next = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.update",
    input: {
      workspaceId: input.workspaceId,
      ref: { type: "task", id: current.id },
      patch: mergeGooglePatch(current, input.googleTask),
    },
    idempotencyKey: `google-tasks:${input.taskListId}:${input.googleTask.id}:pull:${
      input.googleTask.updated ?? "unknown"
    }`,
  }) as Task

  const nextLink = await saveLink(input, pluginId, next, input.googleTask)
  return { action: "updated", task: next, link: nextLink }
}

export async function syncBareGoogleTasks(
  input: BareGoogleTasksSyncInput,
): Promise<BareGoogleTasksSyncResult> {
  const pluginId = input.pluginId ?? BARE_GOOGLE_TASKS_PLUGIN_ID
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "network:external")
  const syncRef = { workspaceId: input.workspaceId, pluginId, taskListId: input.taskListId }
  const before = await input.state.getSyncState(syncRef)
  const updatedMin = input.updatedMin ?? before.updatedMin ?? undefined
  let pushed = 0
  let pulled = 0
  let ignored = 0
  let maxUpdated = updatedMin ?? null

  for (const task of input.pushTasks ?? []) {
    await pushBareCrmTaskToGoogleTasks({ ...input, pluginId, task })
    pushed += 1
  }

  let pageToken: string | undefined
  do {
    const page = await input.client.listTasks({
      taskListId: input.taskListId,
      updatedMin,
      pageToken,
      maxResults: input.maxResults ?? 100,
      showCompleted: true,
      showDeleted: true,
      showHidden: true,
      showAssigned: false,
    })
    pageToken = page.nextPageToken
    for (const googleTask of page.items) {
      const result = await pullGoogleTaskToBareCrm({ ...input, pluginId, googleTask })
      if (result.action === "updated") pulled += 1
      else ignored += 1
      if (googleTask.updated && (!maxUpdated || googleTask.updated > maxUpdated)) {
        maxUpdated = googleTask.updated
      }
    }
  } while (pageToken)

  await input.state.setSyncState({
    ...syncRef,
    updatedMin: maxUpdated,
    pageToken: null,
  })

  return {
    pushed,
    pulled,
    ignored,
    updatedMinBefore: before.updatedMin,
    updatedMinAfter: maxUpdated,
  }
}

async function resolveGoogleTaskLink(
  input: BareGoogleTasksRunnerOptions,
  pluginId: string,
  googleTask: GoogleTask,
): Promise<BareGoogleTasksLink | null> {
  const existing = await input.state.getLinkByGoogleTaskId({
    workspaceId: input.workspaceId,
    pluginId,
    taskListId: input.taskListId,
    googleTaskId: googleTask.id,
  })
  if (existing) return existing

  const crmTaskId = extractCrmTaskIdFromGoogleTask(googleTask)
  if (!crmTaskId) return null
  return {
    workspaceId: input.workspaceId,
    pluginId,
    taskListId: input.taskListId,
    crmTaskId,
    googleTaskId: googleTask.id,
    googleUpdated: googleTask.updated,
    syncedAt: (input.now ?? (() => new Date()))().toISOString(),
  }
}

async function saveLink(
  input: BareGoogleTasksRunnerOptions,
  pluginId: string,
  task: Task,
  googleTask: GoogleTask,
): Promise<BareGoogleTasksLink> {
  const link: BareGoogleTasksLink = {
    workspaceId: input.workspaceId,
    pluginId,
    taskListId: input.taskListId,
    crmTaskId: task.id,
    googleTaskId: googleTask.id,
    googleUpdated: googleTask.updated,
    crmVersion: task.version,
    syncedAt: (input.now ?? (() => new Date()))().toISOString(),
  }
  await input.state.setLink(link)
  return link
}

async function stampCrmTaskWithGoogleRef(
  input: BareGoogleTasksRunnerOptions,
  pluginId: string,
  task: Task,
  googleTask: GoogleTask,
): Promise<void> {
  const externalRef = googleTaskExternalRef({
    taskListId: input.taskListId,
    googleTaskId: googleTask.id,
    webViewLink: googleTask.webViewLink,
  })
  const hasRef = task.externalRefs?.some((candidate) =>
    candidate.system === externalRef.system && candidate.id === externalRef.id
  )
  if (hasRef) return
  await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.update",
    input: {
      workspaceId: input.workspaceId,
      ref: { type: "task", id: task.id },
      patch: {
        externalRefs: [...(task.externalRefs ?? []), externalRef],
        custom: {
          ...task.custom,
          googleTasks: compactObject({
            taskListId: input.taskListId,
            taskId: googleTask.id,
            updated: googleTask.updated,
            webViewLink: googleTask.webViewLink,
          }),
        },
      },
    },
    idempotencyKey: `google-tasks:${input.taskListId}:${googleTask.id}:stamp:${task.id}`,
  })
}

function mergeGooglePatch(current: Task, googleTask: GoogleTask): Partial<Task> {
  const googlePatch = googleTaskToCrmTaskPatch(googleTask)
  return {
    status: googlePatch.status,
    custom: {
      ...current.custom,
      googleTasks: {
        ...(isRecord(current.custom?.googleTasks) ? current.custom.googleTasks : {}),
        ...(isRecord(googlePatch.custom?.googleTasks) ? googlePatch.custom.googleTasks : {}),
      },
    },
  }
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
  throw new BareGoogleTasksPluginError(
    "google_tasks.capability_not_approved",
    `Google Tasks plugin capability is not approved: ${capability}`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
