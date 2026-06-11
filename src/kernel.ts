import type {
  AnyRecord,
  BaseRecord,
  CommandInputByName,
  CommandName,
  CrmEvent,
  CrmKernel,
  EntityRef,
  EntityType,
  Policy,
  QueryInputByName,
  QueryName,
  QueryResultByName,
  Relation,
  Workflow,
} from "./types.ts"

type StoreKey = `${string}:${EntityType}:${string}`

export class CrmPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly suggestedFix?: unknown,
  ) {
    super(message)
    this.name = "CrmPolicyError"
  }
}

export class CrmNotFoundError extends Error {
  constructor(ref: EntityRef) {
    super(`Record not found: ${ref.type}:${ref.id}`)
    this.name = "CrmNotFoundError"
  }
}

export function createCrmKernel(options: { now?: () => Date; id?: () => string } = {}): CrmKernel {
  const now = options.now ?? (() => new Date())
  const id = options.id ?? randomId
  const records = new Map<StoreKey, AnyRecord>()
  const events: CrmEvent[] = []
  const policies: Policy[] = []
  const workflows: Workflow[] = []

  async function command<C extends CommandName>(
    command: C,
    input: CommandInputByName[C],
  ): Promise<AnyRecord> {
    await evaluatePolicies(policies, command, input)

    const eventTime = now().toISOString()
    let record: AnyRecord

    switch (command) {
      case "person.create":
        record = createRecord("person", input, eventTime, id)
        break
      case "company.create":
        record = createRecord("company", input, eventTime, id)
        break
      case "deal.create":
        record = createRecord("deal", input, eventTime, id)
        break
      case "activity.create":
        record = createRecord("activity", input, eventTime, id)
        break
      case "note.create":
        record = createRecord("note", input, eventTime, id)
        break
      case "task.create":
        record = createRecord("task", input, eventTime, id)
        break
      case "file.create":
        record = createRecord("file", input, eventTime, id)
        break
      case "relation.create":
        {
          const relationInput = input as CommandInputByName["relation.create"]
          assertRefExists(records, relationInput.workspaceId, relationInput.from)
          assertRefExists(records, relationInput.workspaceId, relationInput.to)
          record = createRecord("relation", relationInput, eventTime, id)
        }
        break
      case "record.update": {
        const updateInput = input as CommandInputByName["record.update"]
        const current = getRequired(records, updateInput.ref)
        record = {
          ...current,
          ...updateInput.patch,
          id: current.id,
          type: current.type,
          workspaceId: current.workspaceId,
          createdAt: current.createdAt,
          updatedAt: eventTime,
          version: current.version + 1,
        } as AnyRecord
        break
      }
      case "record.archive": {
        const archiveInput = input as CommandInputByName["record.archive"]
        const current = getRequired(records, archiveInput.ref)
        record = {
          ...current,
          archivedAt: eventTime,
          updatedAt: eventTime,
          version: current.version + 1,
        }
        break
      }
      default:
        throw new Error(`Unsupported command: ${command satisfies never}`)
    }

    records.set(key(record), record)
    const event = appendEvent(events, record, command, eventTime, id)
    await runWorkflows(workflows, event, crm)
    return record
  }

  async function query<Q extends QueryName>(
    query: Q,
    input: QueryInputByName[Q],
  ): Promise<QueryResultByName[Q]> {
    switch (query) {
      case "record.get":
        return (records.get(key(input as QueryInputByName["record.get"])) ??
          null) as QueryResultByName[Q]
      case "record.search": {
        const searchInput = input as QueryInputByName["record.search"]
        const limit = searchInput.limit ?? 50
        const text = searchInput.text?.toLowerCase()
        return Array.from(records.values())
          .filter((record) => record.workspaceId === searchInput.workspaceId)
          .filter((record) => searchInput.includeArchived || !record.archivedAt)
          .filter((record) => !searchInput.type || record.type === searchInput.type)
          .filter((record) => !text || JSON.stringify(record).toLowerCase().includes(text))
          .slice(0, limit) as QueryResultByName[Q]
      }
      case "timeline.list": {
        const timelineInput = input as QueryInputByName["timeline.list"]
        return Array.from(records.values())
          .filter((record) => record.workspaceId === timelineInput.workspaceId)
          .filter((record) => !record.archivedAt)
          .filter((record) => isRelatedTo(record, timelineInput)) as QueryResultByName[Q]
      }
      case "event.list": {
        const eventInput = input as QueryInputByName["event.list"]
        return events
          .filter((event) => event.workspaceId === eventInput.workspaceId)
          .slice(-(eventInput.limit ?? 100)) as QueryResultByName[Q]
      }
      default:
        throw new Error(`Unsupported query: ${query satisfies never}`)
    }
  }

  const crm: CrmKernel = {
    command,
    query,

    policy(policy) {
      policies.push(policy)
      policies.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    },

    workflow(workflow) {
      workflows.push(workflow)
    },
  }

  return crm
}

function createRecord<T extends AnyRecord>(
  type: T["type"],
  input: Record<string, unknown>,
  timestamp: string,
  id: () => string,
): T {
  const base: BaseRecord = {
    id: typeof input.id === "string" ? input.id : id(),
    type,
    workspaceId: String(input.workspaceId),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: undefined,
    createdBy: typeof input.createdBy === "string" ? input.createdBy : undefined,
    ownerId: typeof input.ownerId === "string" ? input.ownerId : undefined,
    source: typeof input.source === "string" ? input.source as BaseRecord["source"] : "manual",
    tags: Array.isArray(input.tags) ? input.tags as string[] : undefined,
    custom: isObject(input.custom) ? input.custom : undefined,
    version: 1,
  }

  return { ...input, ...base } as T
}

async function evaluatePolicies(
  policies: Policy[],
  command: CommandName,
  input: unknown,
): Promise<void> {
  const matching = policies.filter((policy) => policy.appliesTo.includes(command))

  for (const policy of matching) {
    const result = await policy.evaluate({ command, input })
    if (!result.ok && policy.mode === "blocking") {
      throw new CrmPolicyError(result.code, result.message, result.field, result.suggestedFix)
    }
  }
}

async function runWorkflows(
  workflows: Workflow[],
  event: CrmEvent,
  crm: CrmKernel,
): Promise<void> {
  const matching = workflows.filter((workflow) =>
    workflow.trigger === "*" || workflow.trigger === event.name
  )

  for (const workflow of matching) {
    await workflow.run({ event, crm })
  }
}

function appendEvent(
  events: CrmEvent[],
  record: AnyRecord,
  command: CommandName,
  timestamp: string,
  id: () => string,
): CrmEvent {
  const verb = command === "record.update"
    ? "updated"
    : command === "record.archive"
    ? "archived"
    : "created"
  const event: CrmEvent = {
    id: id(),
    workspaceId: record.workspaceId,
    name: `${record.type}.${verb}`,
    record,
    occurredAt: timestamp,
  }
  events.push(event)
  return event
}

function assertRefExists(
  records: Map<StoreKey, AnyRecord>,
  workspaceId: string,
  ref: EntityRef,
): void {
  if (!records.has(`${workspaceId}:${ref.type}:${ref.id}`)) {
    throw new CrmNotFoundError(ref)
  }
}

function getRequired(records: Map<StoreKey, AnyRecord>, ref: EntityRef): AnyRecord {
  const matches = Array.from(records.values()).filter((record) =>
    record.id === ref.id && record.type === ref.type
  )
  const record = matches[0]
  if (!record) throw new CrmNotFoundError(ref)
  return record
}

function isRelatedTo(record: AnyRecord, ref: EntityRef): boolean {
  if (record.type === ref.type && record.id === ref.id) return true

  const maybeRelated = "related" in record && Array.isArray(record.related) ? record.related : []
  const maybeParticipants = "participants" in record && Array.isArray(record.participants)
    ? record.participants
    : []

  if (record.type === "relation") {
    const relation = record as Relation
    return sameRef(relation.from, ref) || sameRef(relation.to, ref)
  }

  return [...maybeRelated, ...maybeParticipants].some((candidate) => sameRef(candidate, ref))
}

function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.type === b.type && a.id === b.id
}

function key(record: { workspaceId: string; type: EntityType; id: string }): StoreKey {
  return `${record.workspaceId}:${record.type}:${record.id}`
}

function randomId(): string {
  return crypto.randomUUID()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
