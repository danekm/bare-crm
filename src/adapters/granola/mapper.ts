import type {
  Activity,
  Collection,
  CreateInput,
  EntityRef,
  ExternalRef,
  Task,
} from "../../types.ts"
import type { GranolaActionItem, GranolaNote, GranolaPersonRef } from "./api.ts"

export const GRANOLA_EXTERNAL_REF_SYSTEM = "granola"

export type GranolaMeetingParticipant = {
  email: string
  name?: string
}

export type GranolaMeetingSignals = {
  participants: GranolaMeetingParticipant[]
  externalParticipants: GranolaMeetingParticipant[]
  actionItems: GranolaActionItem[]
  occurredAt: string
  title: string
  summary: string
}

export type GranolaMappingOptions = {
  includeWebUrl?: boolean
  internalDomains?: string[]
  actionItems?: GranolaActionItem[]
}

export function granolaNoteExternalRef(note: Pick<GranolaNote, "id" | "web_url">): ExternalRef {
  return compactObject({
    system: GRANOLA_EXTERNAL_REF_SYSTEM,
    id: note.id,
    url: note.web_url ?? undefined,
    kind: "canonical",
  })
}

export function granolaTaskExternalRef(
  note: Pick<GranolaNote, "id" | "web_url">,
  index: number,
): ExternalRef {
  return compactObject({
    system: GRANOLA_EXTERNAL_REF_SYSTEM,
    id: `${note.id}:action:${index + 1}`,
    url: note.web_url ?? undefined,
    kind: "dedupe",
  })
}

export function createGranolaMeetingActivityInput(input: {
  workspaceId: string
  note: GranolaNote
  related?: EntityRef[]
  participants?: EntityRef[]
  includeWebUrl?: boolean
}): CreateInput<Activity> {
  const signals = extractGranolaMeetingSignals(input.note)
  return {
    workspaceId: input.workspaceId,
    kind: "meeting",
    subject: signals.title,
    body: signals.summary,
    occurredAt: signals.occurredAt,
    participants: input.participants,
    related: input.related,
    source: "plugin",
    externalRefs: [
      granolaNoteExternalRef({
        ...input.note,
        web_url: input.includeWebUrl ? input.note.web_url : undefined,
      }),
    ],
    custom: {
      granola: compactObject({
        noteId: input.note.id,
        calendarEventId: input.note.calendar_event?.calendar_event_id,
        ownerEmail: normalizeEmail(input.note.owner?.email),
        webUrl: input.includeWebUrl ? input.note.web_url : undefined,
        transcriptStoredInKernel: false,
      }),
    },
  }
}

export function createGranolaMeetingSeriesCollectionInput(input: {
  workspaceId: string
  note: GranolaNote
  related?: EntityRef[]
  includeWebUrl?: boolean
}): CreateInput<Collection> {
  const signals = extractGranolaMeetingSignals(input.note)
  return {
    workspaceId: input.workspaceId,
    title: signals.title,
    kind: "granola.meeting-series",
    status: "open",
    related: input.related,
    source: "plugin",
    externalRefs: [
      granolaNoteExternalRef({
        ...input.note,
        id: granolaMeetingSeriesId(input.note),
        web_url: input.includeWebUrl ? input.note.web_url : undefined,
      }),
    ],
    custom: {
      granola: compactObject({
        noteId: input.note.id,
        calendarEventId: input.note.calendar_event?.calendar_event_id,
        ownerEmail: normalizeEmail(input.note.owner?.email),
        webUrl: input.includeWebUrl ? input.note.web_url : undefined,
      }),
    },
  }
}

export function createGranolaFollowUpTaskInput(input: {
  workspaceId: string
  note: GranolaNote
  actionItem: GranolaActionItem
  actionIndex: number
  related?: EntityRef[]
  includeWebUrl?: boolean
}): CreateInput<Task> {
  return {
    workspaceId: input.workspaceId,
    title: input.actionItem.text,
    status: "todo",
    dueAt: input.actionItem.dueAt,
    related: input.related,
    source: "plugin",
    externalRefs: [
      granolaTaskExternalRef({
        ...input.note,
        web_url: input.includeWebUrl ? input.note.web_url : undefined,
      }, input.actionIndex),
    ],
    custom: {
      granola: compactObject({
        noteId: input.note.id,
        actionIndex: input.actionIndex + 1,
        assigneeEmail: normalizeEmail(input.actionItem.assigneeEmail),
        webUrl: input.includeWebUrl ? input.note.web_url : undefined,
      }),
    },
  }
}

export function extractGranolaMeetingSignals(
  note: GranolaNote,
  options: GranolaMappingOptions = {},
): GranolaMeetingSignals {
  const participants = uniqueParticipants([
    ...(note.attendees ?? []),
    ...(note.calendar_event?.invitees ?? []),
    note.owner,
    note.calendar_event?.organiser ? { email: note.calendar_event.organiser } : undefined,
  ])
  const internalDomains = normalizedDomains(options.internalDomains)
  return {
    participants,
    externalParticipants: participants.filter((participant) =>
      !internalDomains.has(emailDomain(participant.email))
    ),
    actionItems: options.actionItems ?? note.action_items ??
      extractActionItems(note.summary_markdown),
    occurredAt: note.calendar_event?.scheduled_start_time ?? note.created_at,
    title: note.calendar_event?.event_title ?? note.title ?? "Granola meeting",
    summary: note.summary_markdown ?? note.summary_text ?? "Granola meeting summary unavailable.",
  }
}

export function granolaMeetingSeriesId(note: GranolaNote): string {
  return note.calendar_event?.calendar_event_id
    ? `calendar:${note.calendar_event.calendar_event_id}`
    : `note:${note.id}`
}

export function isGranolaNotePrivate(note: GranolaNote): boolean {
  const text = [
    note.title,
    note.calendar_event?.event_title,
    ...(note.folder_membership ?? []).map((folder) => folder.name),
  ].filter(Boolean).join(" ").toLowerCase()
  return /\b(private|personal|confidential|secret|1:1|one-on-one)\b/.test(text)
}

export function normalizeEmail(email: string | null | undefined): string | undefined {
  const value = email?.trim().toLowerCase()
  return value && value.includes("@") ? value : undefined
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? ""
}

function extractActionItems(markdown: string | null | undefined): GranolaActionItem[] {
  if (!markdown) return []
  const lines = markdown.split(/\r?\n/)
  const actionItems: GranolaActionItem[] = []
  let inActionSection = false

  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    if (heading) {
      inActionSection = /\b(action|follow[- ]?up|next step|todo|to do)\b/i.test(heading[1])
      continue
    }
    if (!inActionSection) continue
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+\[?\s?]?\s*(.+?)\s*$/)
    if (item?.[1]) actionItems.push({ text: cleanActionItem(item[1]) })
  }

  return actionItems.filter((item) => item.text.length > 0)
}

function cleanActionItem(value: string): string {
  return value
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueParticipants(
  values: Array<GranolaPersonRef | undefined>,
): GranolaMeetingParticipant[] {
  const seen = new Set<string>()
  const participants: GranolaMeetingParticipant[] = []
  for (const value of values) {
    const email = normalizeEmail(value?.email)
    if (!email || seen.has(email)) continue
    seen.add(email)
    participants.push(compactObject({ email, name: value?.name ?? undefined }))
  }
  return participants
}

function normalizedDomains(domains: string[] | undefined): Set<string> {
  return new Set((domains ?? []).map((domain) => domain.trim().toLowerCase()).filter(Boolean))
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
