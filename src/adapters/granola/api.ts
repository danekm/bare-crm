export type GranolaPersonRef = {
  name?: string | null
  email?: string | null
}

export type GranolaCalendarEvent = {
  event_title?: string | null
  invitees?: GranolaPersonRef[]
  organiser?: string | null
  calendar_event_id?: string | null
  scheduled_start_time?: string | null
  scheduled_end_time?: string | null
}

export type GranolaFolderMembership = {
  id: string
  object?: "folder"
  name?: string | null
  parent_folder_id?: string | null
}

export type GranolaTranscriptItem = {
  speaker?: {
    source?: string
    diarization_label?: string
  }
  text: string
  start_time?: string | null
  end_time?: string | null
}

export type GranolaActionItem = {
  text: string
  assigneeEmail?: string
  dueAt?: string
}

export type GranolaNoteListItem = {
  id: string
  object?: "note"
  title?: string | null
  owner?: GranolaPersonRef
  created_at: string
  updated_at: string
}

export type GranolaNote = GranolaNoteListItem & {
  web_url?: string | null
  calendar_event?: GranolaCalendarEvent | null
  attendees?: GranolaPersonRef[]
  folder_membership?: GranolaFolderMembership[]
  summary_text?: string | null
  summary_markdown?: string | null
  transcript?: GranolaTranscriptItem[] | null
  action_items?: GranolaActionItem[]
}

export type GranolaListNotesInput = {
  created_after?: string
  created_before?: string
  updated_after?: string
  folder_id?: string
  cursor?: string
  page_size?: number
}

export type GranolaListNotesResult = {
  notes: GranolaNoteListItem[]
  hasMore: boolean
  cursor: string | null
}

export type GranolaGetNoteInput = {
  noteId: string
  includeTranscript?: boolean
}

export type GranolaApiClient = {
  listNotes(input?: GranolaListNotesInput): Promise<GranolaListNotesResult>
  getNote(input: GranolaGetNoteInput): Promise<GranolaNote>
}

export type GranolaApiClientOptions = {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

export class GranolaApiError extends Error {
  constructor(
    readonly code:
      | "granola.api_invalid_response"
      | "granola.api_request_failed",
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "GranolaApiError"
  }
}

export function createGranolaApiClient(options: GranolaApiClientOptions): GranolaApiClient {
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = (options.baseUrl ?? "https://public-api.granola.ai/v1").replace(/\/+$/, "")

  return {
    async listNotes(input = {}) {
      const url = new URL(`${baseUrl}/notes`)
      appendQuery(url, input)
      const value = await requestJson(fetchImpl, url, options.apiKey)
      if (!isRecord(value) || !Array.isArray(value.notes) || typeof value.hasMore !== "boolean") {
        throw new GranolaApiError(
          "granola.api_invalid_response",
          "Granola list notes returned an invalid response.",
        )
      }
      return {
        notes: value.notes.map(assertNoteListItem),
        hasMore: value.hasMore,
        cursor: typeof value.cursor === "string" ? value.cursor : null,
      }
    },

    async getNote(input) {
      const url = new URL(`${baseUrl}/notes/${encodeURIComponent(input.noteId)}`)
      if (input.includeTranscript) url.searchParams.set("include", "transcript")
      return assertNote(await requestJson(fetchImpl, url, options.apiKey))
    },
  }
}

function appendQuery(url: URL, input: GranolaListNotesInput): void {
  for (
    const [key, value] of Object.entries(input) as Array<
      [keyof GranolaListNotesInput, string | number | undefined]
    >
  ) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: URL,
  apiKey: string,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  })
  if (!response.ok) {
    throw new GranolaApiError(
      "granola.api_request_failed",
      `Granola API request failed with status ${response.status}.`,
      response.status,
    )
  }
  return await response.json()
}

function assertNote(value: unknown): GranolaNote {
  const listItem = assertNoteListItem(value)
  const record = value as Record<string, unknown>
  return {
    ...listItem,
    web_url: optionalString(record.web_url),
    calendar_event: isRecord(record.calendar_event)
      ? {
        event_title: optionalString(record.calendar_event.event_title),
        invitees: Array.isArray(record.calendar_event.invitees)
          ? record.calendar_event.invitees.map(assertPersonRef)
          : [],
        organiser: optionalString(record.calendar_event.organiser),
        calendar_event_id: optionalString(record.calendar_event.calendar_event_id),
        scheduled_start_time: optionalString(record.calendar_event.scheduled_start_time),
        scheduled_end_time: optionalString(record.calendar_event.scheduled_end_time),
      }
      : null,
    attendees: Array.isArray(record.attendees) ? record.attendees.map(assertPersonRef) : [],
    folder_membership: Array.isArray(record.folder_membership)
      ? record.folder_membership.filter(isRecord).map((folder) => ({
        id: assertString(folder.id, "folder.id"),
        object: folder.object === "folder" ? "folder" : undefined,
        name: optionalString(folder.name),
        parent_folder_id: optionalString(folder.parent_folder_id),
      }))
      : [],
    summary_text: optionalString(record.summary_text),
    summary_markdown: optionalString(record.summary_markdown),
    transcript: Array.isArray(record.transcript)
      ? record.transcript.filter(isRecord).map((item) => ({
        speaker: isRecord(item.speaker)
          ? {
            source: optionalString(item.speaker.source) ?? undefined,
            diarization_label: optionalString(item.speaker.diarization_label) ?? undefined,
          }
          : undefined,
        text: assertString(item.text, "transcript.text"),
        start_time: optionalString(item.start_time),
        end_time: optionalString(item.end_time),
      }))
      : null,
    action_items: Array.isArray(record.action_items)
      ? record.action_items.filter(isRecord).map((item) => ({
        text: assertString(item.text, "action_items.text"),
        assigneeEmail: optionalString(item.assigneeEmail) ?? undefined,
        dueAt: optionalString(item.dueAt) ?? undefined,
      }))
      : undefined,
  }
}

function assertNoteListItem(value: unknown): GranolaNoteListItem {
  if (!isRecord(value)) {
    throw new GranolaApiError(
      "granola.api_invalid_response",
      "Granola note must be an object.",
    )
  }
  return {
    id: assertString(value.id, "note.id"),
    object: value.object === "note" ? "note" : undefined,
    title: optionalString(value.title),
    owner: isRecord(value.owner) ? assertPersonRef(value.owner) : undefined,
    created_at: assertString(value.created_at, "note.created_at"),
    updated_at: assertString(value.updated_at, "note.updated_at"),
  }
}

function assertPersonRef(value: unknown): GranolaPersonRef {
  if (!isRecord(value)) {
    throw new GranolaApiError(
      "granola.api_invalid_response",
      "Granola person reference must be an object.",
    )
  }
  return {
    name: optionalString(value.name),
    email: optionalString(value.email),
  }
}

function optionalString(value: unknown): string | null | undefined {
  return typeof value === "string" ? value : value === null ? null : undefined
}

function assertString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new GranolaApiError(
    "granola.api_invalid_response",
    `Granola response field is missing or invalid: ${field}.`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
