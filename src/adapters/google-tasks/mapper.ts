import type { ExternalRef, Task, UpdateInput } from "../../types.ts"
import type { GoogleTask, GoogleTaskWrite } from "./api.ts"

export const GOOGLE_TASKS_EXTERNAL_REF_SYSTEM = "google-tasks"
export const BARE_CRM_TASK_MARKER = "Bare CRM Task:"

export type GoogleTasksMappingOptions = {
  taskListId: string
  includeCrmContext?: boolean
}

export function googleTaskExternalRef(input: {
  taskListId: string
  googleTaskId: string
  webViewLink?: string
}): ExternalRef {
  return compactObject({
    system: GOOGLE_TASKS_EXTERNAL_REF_SYSTEM,
    id: `${input.taskListId}:${input.googleTaskId}`,
    url: input.webViewLink,
    kind: "canonical",
  })
}

export function crmTaskToGoogleTaskWrite(
  task: Task,
  options: GoogleTasksMappingOptions,
): GoogleTaskWrite {
  return compactObject({
    title: task.title,
    notes: googleNotesForCrmTask(task, options),
    status: task.status === "done" ? "completed" : "needsAction",
    due: task.dueAt ? googleDueDate(task.dueAt) : undefined,
    completed: task.status === "done" ? task.updatedAt : null,
  })
}

export function googleTaskToCrmTaskPatch(
  googleTask: GoogleTask,
): UpdateInput<Task> {
  const status = googleTask.deleted
    ? "canceled"
    : googleTask.status === "completed"
    ? "done"
    : "todo"

  return compactObject({
    title: googleTask.title,
    body: googleTask.notes,
    status,
    dueAt: googleTask.due ? crmDueAtFromGoogleDue(googleTask.due) : undefined,
    custom: {
      googleTasks: compactObject({
        taskId: googleTask.id,
        updated: googleTask.updated,
        webViewLink: googleTask.webViewLink,
        deleted: googleTask.deleted,
        hidden: googleTask.hidden,
      }),
    },
  })
}

export function extractCrmTaskIdFromGoogleTask(googleTask: GoogleTask): string | null {
  const match = googleTask.notes?.match(/Bare CRM Task:\s*([A-Za-z0-9._:-]+)/)
  return match?.[1] ?? null
}

export function googleDueDate(value: string): string {
  const date = value.includes("T") ? value.slice(0, 10) : value
  return `${date}T00:00:00.000Z`
}

export function crmDueAtFromGoogleDue(value: string): string {
  return googleDueDate(value)
}

function googleNotesForCrmTask(task: Task, options: GoogleTasksMappingOptions): string {
  const lines = [
    task.body,
    "",
    `${BARE_CRM_TASK_MARKER} ${task.id}`,
    `Bare CRM Workspace: ${task.workspaceId}`,
  ]
  if (options.includeCrmContext !== false && task.related?.length) {
    lines.push(
      `Bare CRM Related: ${task.related.map((ref) => `${ref.type}:${ref.id}`).join(", ")}`,
    )
  }
  return lines.filter((line) => line !== undefined).join("\n").trim()
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
