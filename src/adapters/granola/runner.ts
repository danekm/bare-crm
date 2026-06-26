import manifestJson from "./plugin.json" with { type: "json" }
import { validatePluginManifest } from "../../index.ts"
import type {
  Activity,
  AnyRecord,
  Company,
  EntityRef,
  EntityType,
  ExtensionHost,
  ExtensionPluginState,
  ExternalRef,
  Person,
  PluginManifest,
  PluginRuntimeCapability,
  Task,
} from "../../index.ts"
import type { GranolaActionItem, GranolaApiClient, GranolaNote } from "./api.ts"
import {
  createGranolaFollowUpTaskInput,
  createGranolaMeetingActivityInput,
  createGranolaMeetingSeriesCollectionInput,
  emailDomain,
  extractGranolaMeetingSignals,
  granolaMeetingSeriesId,
  granolaNoteExternalRef,
  granolaTaskExternalRef,
  isGranolaNotePrivate,
  normalizeEmail,
} from "./mapper.ts"
import type { BareGranolaPluginStateStore } from "./state.ts"

export const BARE_GRANOLA_PLUGIN_ID = "bare.granola"
export const BARE_GRANOLA_SYNC_ID = "granola.note-sync"

export const BARE_GRANOLA_REQUIRED_CAPABILITIES: PluginRuntimeCapability[] = [
  "plugin:commands",
  "plugin:profiles",
  "plugin:sync",
  "network:external",
  "secrets:read",
  "crm:read:record.search",
  "crm:write:person.create",
  "crm:write:company.create",
  "crm:write:collection.create",
  "crm:write:activity.create",
  "crm:write:task.create",
  "crm:write:relation.create",
]

export const bareGranolaPluginManifest: PluginManifest = validatePluginManifest(manifestJson)

export type BareGranolaPluginInstallInput = {
  workspaceId: string
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type BareGranolaRunnerOptions = {
  host: ExtensionHost
  workspaceId: string
  pluginId?: string
  internalDomains?: string[]
  requireExternalParticipant?: boolean
  autoCreateContacts?: boolean
  autoCreateCompanies?: boolean
  createFollowUpTasks?: boolean
  createMeetingSeries?: boolean
  includeWebUrl?: boolean
  storeRawNotes?: boolean
}

export type BareGranolaProcessNoteInput = {
  note: GranolaNote
  related?: EntityRef[]
  actionItems?: GranolaActionItem[]
}

export type BareGranolaWriteResult<T extends AnyRecord> = {
  status: "created" | "matched"
  record: T
}

export type BareGranolaProcessNoteResult = {
  action: "skipped" | "promoted"
  skippedReason?: "private" | "internal_only"
  activity?: BareGranolaWriteResult<Activity>
  tasks: Array<BareGranolaWriteResult<Task>>
  related: EntityRef[]
}

export type BareGranolaRunner = {
  processNote(input: BareGranolaProcessNoteInput): Promise<BareGranolaProcessNoteResult>
}

export type BareGranolaSyncNotesInput = BareGranolaRunnerOptions & {
  client: GranolaApiClient
  state: BareGranolaPluginStateStore
  updatedAfter?: string
  pageSize?: number
  includeTranscript?: boolean
  limit?: number
}

export type BareGranolaSyncNotesResult = {
  cursorBefore: string | null
  cursorAfter: string | null
  processed: number
  promoted: number
  skipped: number
  tasksCreated: number
}

export class BareGranolaPluginError extends Error {
  constructor(
    readonly code:
      | "granola.external_ref_ambiguous"
      | "granola.capability_not_approved",
    message: string,
  ) {
    super(message)
    this.name = "BareGranolaPluginError"
  }
}

export function installBareGranolaPlugin(
  host: ExtensionHost,
  input: BareGranolaPluginInstallInput,
): ExtensionPluginState {
  return host.installPlugin({
    workspaceId: input.workspaceId,
    manifest: bareGranolaPluginManifest,
    approvedCapabilities: input.approvedCapabilities ?? BARE_GRANOLA_REQUIRED_CAPABILITIES,
    enabled: input.enabled ?? true,
  })
}

export function createBareGranolaRunner(options: BareGranolaRunnerOptions): BareGranolaRunner {
  return {
    processNote(input) {
      return processBareGranolaNote({ ...options, ...input })
    },
  }
}

export async function processBareGranolaNote(
  input: BareGranolaRunnerOptions & BareGranolaProcessNoteInput,
): Promise<BareGranolaProcessNoteResult> {
  const pluginId = input.pluginId ?? BARE_GRANOLA_PLUGIN_ID
  const signals = extractGranolaMeetingSignals(input.note, {
    internalDomains: input.internalDomains,
    actionItems: input.actionItems,
  })
  const requireExternalParticipant = input.requireExternalParticipant ??
    Boolean(input.internalDomains?.length || input.note.owner?.email)

  if (isGranolaNotePrivate(input.note)) {
    return { action: "skipped", skippedReason: "private", tasks: [], related: [] }
  }
  if (requireExternalParticipant && signals.externalParticipants.length === 0) {
    return { action: "skipped", skippedReason: "internal_only", tasks: [], related: [] }
  }

  const related = uniqueRefs([
    ...(input.related ?? []),
    ...await resolveParticipantRefs(input, pluginId, signals.externalParticipants),
  ])

  if (input.createMeetingSeries) {
    await findOrCreateMeetingSeries({
      ...input,
      pluginId,
      related,
    })
  }

  const activity = await findOrCreateMeetingActivity({
    ...input,
    pluginId,
    related,
  })
  const activityRef: EntityRef<"activity"> = {
    type: "activity",
    id: activity.record.id,
  }
  const tasks = (input.createFollowUpTasks ?? true)
    ? await findOrCreateFollowUpTasks({
      ...input,
      pluginId,
      actionItems: signals.actionItems,
      related: uniqueRefs([activityRef, ...related]),
    })
    : []

  return {
    action: "promoted",
    activity,
    tasks,
    related,
  }
}

export async function syncBareGranolaNotes(
  input: BareGranolaSyncNotesInput,
): Promise<BareGranolaSyncNotesResult> {
  const pluginId = input.pluginId ?? BARE_GRANOLA_PLUGIN_ID
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "network:external")
  const cursorRef = { workspaceId: input.workspaceId, pluginId, syncId: BARE_GRANOLA_SYNC_ID }
  const stateBefore = await input.state.getSyncState(cursorRef)
  const cursorBefore = stateBefore.updatedAfter
  const updatedAfter = input.updatedAfter ?? stateBefore.updatedAfter ?? undefined
  const runner = createBareGranolaRunner(input)
  let cursor: string | undefined
  let processed = 0
  let promoted = 0
  let skipped = 0
  let tasksCreated = 0
  let maxUpdatedAt = updatedAfter ?? null

  do {
    const page = await input.client.listNotes({
      updated_after: updatedAfter,
      cursor,
      page_size: input.pageSize ?? 10,
    })
    cursor = page.cursor ?? undefined
    for (const item of page.notes) {
      if (input.limit !== undefined && processed >= input.limit) break
      const note = await input.client.getNote({
        noteId: item.id,
        includeTranscript: input.includeTranscript && input.storeRawNotes,
      })
      if (input.storeRawNotes) await input.state.saveRawNote?.({ ...cursorRef, note })
      const result = await runner.processNote({ note })
      processed += 1
      if (result.action === "promoted") promoted += 1
      else skipped += 1
      tasksCreated += result.tasks.filter((task) => task.status === "created").length
      if (!maxUpdatedAt || note.updated_at > maxUpdatedAt) maxUpdatedAt = note.updated_at
    }
    if (input.limit !== undefined && processed >= input.limit) break
    if (!page.hasMore) break
  } while (cursor)

  await input.state.setSyncState({
    ...cursorRef,
    updatedAfter: maxUpdatedAt,
    lastCursor: cursor ?? null,
  })

  return {
    cursorBefore,
    cursorAfter: maxUpdatedAt,
    processed,
    promoted,
    skipped,
    tasksCreated,
  }
}

async function findOrCreateMeetingActivity(
  input: BareGranolaRunnerOptions & {
    pluginId: string
    note: GranolaNote
    related: EntityRef[]
  },
): Promise<BareGranolaWriteResult<Activity>> {
  const existing = await findOneByExternalRef(input, "activity", granolaNoteExternalRef(input.note))
  if (existing) return { status: "matched", record: existing }

  const participantRefs = input.related.filter((ref): ref is EntityRef<"person"> =>
    ref.type === "person"
  )
  const record = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "activity.create",
    input: createGranolaMeetingActivityInput({
      workspaceId: input.workspaceId,
      note: input.note,
      related: input.related,
      participants: participantRefs,
      includeWebUrl: input.includeWebUrl,
    }),
    idempotencyKey: `granola:note:${input.note.id}:activity`,
  }) as Activity

  return { status: "created", record }
}

async function findOrCreateMeetingSeries(
  input: BareGranolaRunnerOptions & {
    pluginId: string
    note: GranolaNote
    related: EntityRef[]
  },
): Promise<void> {
  const externalRef: ExternalRef = {
    system: "granola",
    id: granolaMeetingSeriesId(input.note),
  }
  const existing = await findOneByExternalRef(input, "collection", externalRef)
  if (existing) return

  await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "collection.create",
    input: createGranolaMeetingSeriesCollectionInput({
      workspaceId: input.workspaceId,
      note: input.note,
      related: input.related,
      includeWebUrl: input.includeWebUrl,
    }),
    idempotencyKey: `granola:series:${granolaMeetingSeriesId(input.note)}:collection`,
  })
}

async function findOrCreateFollowUpTasks(
  input: BareGranolaRunnerOptions & {
    pluginId: string
    note: GranolaNote
    actionItems: GranolaActionItem[]
    related: EntityRef[]
  },
): Promise<Array<BareGranolaWriteResult<Task>>> {
  const tasks: Array<BareGranolaWriteResult<Task>> = []
  for (const [index, actionItem] of input.actionItems.entries()) {
    const externalRef = granolaTaskExternalRef(input.note, index)
    const existing = await findOneByExternalRef(input, "task", externalRef)
    if (existing) {
      tasks.push({ status: "matched", record: existing })
      continue
    }
    const record = await input.host.writeAsPlugin({
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      name: "task.create",
      input: createGranolaFollowUpTaskInput({
        workspaceId: input.workspaceId,
        note: input.note,
        actionItem,
        actionIndex: index,
        related: input.related,
        includeWebUrl: input.includeWebUrl,
      }),
      idempotencyKey: `granola:note:${input.note.id}:action:${index + 1}:task`,
    }) as Task
    tasks.push({ status: "created", record })
  }
  return tasks
}

async function resolveParticipantRefs(
  input: BareGranolaRunnerOptions,
  pluginId: string,
  participants: Array<{ email: string; name?: string }>,
): Promise<EntityRef[]> {
  const refs: EntityRef[] = []
  for (const participant of participants) {
    const person = await findOrCreatePersonForParticipant(input, pluginId, participant)
    if (person) refs.push({ type: "person", id: person.id })
    const company = await findOrCreateCompanyForParticipant(input, pluginId, participant.email)
    if (company) refs.push({ type: "company", id: company.id })
  }
  return uniqueRefs(refs)
}

async function findOrCreatePersonForParticipant(
  input: BareGranolaRunnerOptions,
  pluginId: string,
  participant: { email: string; name?: string },
): Promise<Person | null> {
  const matches = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.search",
    input: {
      workspaceId: input.workspaceId,
      type: "person",
      text: participant.email,
      limit: 2,
    },
  })
  const persons = matches.filter((record): record is Person => record.type === "person")
  if (persons.length > 0) return persons[0]
  if (!input.autoCreateContacts) return null

  return await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "person.create",
    input: {
      workspaceId: input.workspaceId,
      name: participant.name ?? participant.email,
      emails: [{ value: participant.email, primary: true }],
      source: "plugin",
      externalRefs: [{
        system: "granola",
        id: `participant:${participant.email}`,
        kind: "dedupe",
      }],
    },
    idempotencyKey: `granola:participant:${participant.email}:person`,
  }) as Person
}

async function findOrCreateCompanyForParticipant(
  input: BareGranolaRunnerOptions,
  pluginId: string,
  email: string,
): Promise<Company | null> {
  const domain = emailDomain(email)
  if (!domain) return null
  const matches = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.search",
    input: {
      workspaceId: input.workspaceId,
      type: "company",
      text: domain,
      limit: 2,
    },
  })
  const companies = matches.filter((record): record is Company => record.type === "company")
  if (companies.length > 0) return companies[0]
  if (!input.autoCreateCompanies) return null

  return await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "company.create",
    input: {
      workspaceId: input.workspaceId,
      name: domain,
      domains: [domain],
      source: "plugin",
      externalRefs: [{
        system: "granola",
        id: `domain:${domain}`,
        kind: "dedupe",
      }],
    },
    idempotencyKey: `granola:domain:${domain}:company`,
  }) as Company
}

async function findOneByExternalRef<T extends EntityType>(
  input: {
    host: ExtensionHost
    workspaceId: string
    pluginId: string
  },
  type: T,
  externalRef: ExternalRef,
): Promise<Extract<AnyRecord, { type: T }> | null> {
  const matches = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId: input.pluginId,
    name: "record.search",
    input: {
      workspaceId: input.workspaceId,
      type,
      externalRef,
      limit: 2,
    },
  })

  if (matches.length > 1) {
    throw new BareGranolaPluginError(
      "granola.external_ref_ambiguous",
      `External reference matched multiple ${type} records: ${externalRef.system}:${externalRef.id}`,
    )
  }

  return (matches[0] ?? null) as Extract<AnyRecord, { type: T }> | null
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
  throw new BareGranolaPluginError(
    "granola.capability_not_approved",
    `Granola plugin capability is not approved: ${capability}`,
  )
}

function uniqueRefs(refs: EntityRef[]): EntityRef[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = `${ref.type}:${ref.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
