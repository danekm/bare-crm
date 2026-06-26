export type GoogleTaskStatus = "needsAction" | "completed"

export type GoogleTask = {
  kind?: "tasks#task"
  id: string
  etag?: string
  title?: string
  updated?: string
  selfLink?: string
  parent?: string
  position?: string
  notes?: string
  status?: GoogleTaskStatus
  due?: string
  completed?: string
  deleted?: boolean
  hidden?: boolean
  webViewLink?: string
  assignmentInfo?: Record<string, unknown>
}

export type GoogleTasksListInput = {
  taskListId: string
  completedMax?: string
  completedMin?: string
  dueMax?: string
  dueMin?: string
  maxResults?: number
  pageToken?: string
  showAssigned?: boolean
  showCompleted?: boolean
  showDeleted?: boolean
  showHidden?: boolean
  updatedMin?: string
}

export type GoogleTasksListResult = {
  kind?: "tasks#tasks"
  etag?: string
  nextPageToken?: string
  items: GoogleTask[]
}

export type GoogleTasksInsertInput = {
  taskListId: string
  task: GoogleTaskWrite
  parent?: string
  previous?: string
}

export type GoogleTasksPatchInput = {
  taskListId: string
  taskId: string
  task: GoogleTaskWrite
}

export type GoogleTasksDeleteInput = {
  taskListId: string
  taskId: string
}

export type GoogleTaskWrite = {
  title?: string
  notes?: string
  status?: GoogleTaskStatus
  due?: string
  completed?: string | null
}

export type GoogleTasksApiClient = {
  listTasks(input: GoogleTasksListInput): Promise<GoogleTasksListResult>
  insertTask(input: GoogleTasksInsertInput): Promise<GoogleTask>
  patchTask(input: GoogleTasksPatchInput): Promise<GoogleTask>
  deleteTask(input: GoogleTasksDeleteInput): Promise<void>
}

export type GoogleTasksApiClientOptions = {
  accessToken: string
  baseUrl?: string
  fetch?: typeof fetch
}

export class GoogleTasksApiError extends Error {
  constructor(
    readonly code:
      | "google_tasks.api_invalid_response"
      | "google_tasks.api_request_failed",
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "GoogleTasksApiError"
  }
}

export function createGoogleTasksApiClient(
  options: GoogleTasksApiClientOptions,
): GoogleTasksApiClient {
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = (options.baseUrl ?? "https://tasks.googleapis.com/tasks/v1").replace(/\/+$/, "")

  return {
    async listTasks(input) {
      const url = new URL(`${baseUrl}/lists/${encodeURIComponent(input.taskListId)}/tasks`)
      appendQuery(url, {
        completedMax: input.completedMax,
        completedMin: input.completedMin,
        dueMax: input.dueMax,
        dueMin: input.dueMin,
        maxResults: input.maxResults,
        pageToken: input.pageToken,
        showAssigned: input.showAssigned,
        showCompleted: input.showCompleted,
        showDeleted: input.showDeleted,
        showHidden: input.showHidden,
        updatedMin: input.updatedMin,
      })
      const value = await requestJson(fetchImpl, url, options.accessToken, "GET")
      if (!isRecord(value)) {
        throw new GoogleTasksApiError(
          "google_tasks.api_invalid_response",
          "Google Tasks list returned an invalid response.",
        )
      }
      return {
        kind: value.kind === "tasks#tasks" ? "tasks#tasks" : undefined,
        etag: optionalString(value.etag),
        nextPageToken: optionalString(value.nextPageToken),
        items: Array.isArray(value.items) ? value.items.map(assertGoogleTask) : [],
      }
    },

    async insertTask(input) {
      const url = new URL(`${baseUrl}/lists/${encodeURIComponent(input.taskListId)}/tasks`)
      appendQuery(url, {
        parent: input.parent,
        previous: input.previous,
      })
      return assertGoogleTask(
        await requestJson(fetchImpl, url, options.accessToken, "POST", input.task),
      )
    },

    async patchTask(input) {
      const url = new URL(
        `${baseUrl}/lists/${encodeURIComponent(input.taskListId)}/tasks/${
          encodeURIComponent(input.taskId)
        }`,
      )
      return assertGoogleTask(
        await requestJson(fetchImpl, url, options.accessToken, "PATCH", input.task),
      )
    },

    async deleteTask(input) {
      const url = new URL(
        `${baseUrl}/lists/${encodeURIComponent(input.taskListId)}/tasks/${
          encodeURIComponent(input.taskId)
        }`,
      )
      await requestJson(fetchImpl, url, options.accessToken, "DELETE")
    },
  }
}

function appendQuery(
  url: URL,
  input: Record<string, string | number | boolean | undefined>,
): void {
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: URL,
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new GoogleTasksApiError(
      "google_tasks.api_request_failed",
      `Google Tasks API request failed with status ${response.status}.`,
      response.status,
    )
  }
  if (response.status === 204 || method === "DELETE") return null
  return await response.json()
}

function assertGoogleTask(value: unknown): GoogleTask {
  if (!isRecord(value)) {
    throw new GoogleTasksApiError(
      "google_tasks.api_invalid_response",
      "Google Tasks task must be an object.",
    )
  }
  return {
    kind: value.kind === "tasks#task" ? "tasks#task" : undefined,
    id: assertString(value.id, "task.id"),
    etag: optionalString(value.etag),
    title: optionalString(value.title),
    updated: optionalString(value.updated),
    selfLink: optionalString(value.selfLink),
    parent: optionalString(value.parent),
    position: optionalString(value.position),
    notes: optionalString(value.notes),
    status: value.status === "completed" ? "completed" : "needsAction",
    due: optionalString(value.due),
    completed: optionalString(value.completed),
    deleted: typeof value.deleted === "boolean" ? value.deleted : undefined,
    hidden: typeof value.hidden === "boolean" ? value.hidden : undefined,
    webViewLink: optionalString(value.webViewLink),
    assignmentInfo: isRecord(value.assignmentInfo) ? value.assignmentInfo : undefined,
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function assertString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new GoogleTasksApiError(
    "google_tasks.api_invalid_response",
    `Google Tasks response field is missing or invalid: ${field}.`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
