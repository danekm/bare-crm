import { createMemoryStorage, type StorageApi, type StorageTx } from "./storage.ts"
import type {
  AnyRecord,
  BaseRecord,
  CreateInput,
  CrmEvent,
  CrmKernel,
  EntityRef,
  EntityType,
  ReadInputByName,
  ReadName,
  ReadResultByName,
  Relation,
  WriteInputByName,
  WriteName,
  WriteOptions,
  WriteResultByName,
} from "./types.ts"

export class CrmKernelError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = "CrmKernelError"
  }
}

export class CrmNotFoundError extends CrmKernelError {
  constructor(ref: EntityRef) {
    super("record.not_found", `Record not found: ${ref.type}:${ref.id}`)
    this.name = "CrmNotFoundError"
  }
}

export function createCrmKernel(
  options: { storage?: StorageApi; now?: () => Date; id?: () => string } = {},
): CrmKernel {
  const storage = options.storage ?? createMemoryStorage()
  const now = options.now ?? (() => new Date())
  const id = options.id ?? randomId

  async function write<W extends WriteName>(
    name: W,
    input: WriteInputByName[W],
    options?: WriteOptions,
  ): Promise<WriteResultByName[W]> {
    const workspaceId = getWorkspaceId(input)
    assertContextWorkspace(workspaceId, options)

    const idempotencyKey = options?.idempotencyKey
      ? `${workspaceId}:${name}:${options.idempotencyKey}`
      : undefined

    return await storage.transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.getIdempotencyResult(idempotencyKey)
        if (existing) return existing as WriteResultByName[W]
      }

      const timestamp = now().toISOString()
      const writeId = id()
      const record = await applyWrite(tx, name, input, timestamp, id)
      const event = createEvent(record, name, timestamp, writeId, id, options)

      await tx.put(record, getPutOptions(name, record))
      await tx.appendEvent(event)

      if (idempotencyKey) {
        await tx.saveIdempotencyResult(idempotencyKey, record)
      }

      return record as WriteResultByName[W]
    })
  }

  async function read<R extends ReadName>(
    name: R,
    input: ReadInputByName[R],
  ): Promise<ReadResultByName[R]> {
    return await storage.transaction(async (tx) => {
      switch (name) {
        case "record.get":
          return await tx.get(input as ReadInputByName["record.get"]) as ReadResultByName[R]
        case "record.search":
          return await tx.search(input as ReadInputByName["record.search"]) as ReadResultByName[R]
        case "timeline.list":
          return await readTimeline(
            tx,
            input as ReadInputByName["timeline.list"],
          ) as ReadResultByName[R]
        case "relation.list":
          return await readRelations(
            tx,
            input as ReadInputByName["relation.list"],
          ) as ReadResultByName[R]
        case "event.list":
          return await tx.listEvents(input as ReadInputByName["event.list"]) as ReadResultByName[R]
        default:
          throw new Error(`Unsupported read: ${name satisfies never}`)
      }
    })
  }

  return { write, read }
}

async function applyWrite<W extends WriteName>(
  tx: StorageTx,
  name: W,
  input: WriteInputByName[W],
  timestamp: string,
  id: () => string,
): Promise<AnyRecord> {
  switch (name) {
    case "person.create":
      return createRecord("person", input as WriteInputByName["person.create"], timestamp, id)
    case "company.create":
      return createRecord("company", input as WriteInputByName["company.create"], timestamp, id)
    case "deal.create":
      return createRecord("deal", input as WriteInputByName["deal.create"], timestamp, id)
    case "activity.create":
      return createRecord("activity", input as WriteInputByName["activity.create"], timestamp, id)
    case "note.create":
      return createRecord("note", input as WriteInputByName["note.create"], timestamp, id)
    case "task.create":
      return createRecord("task", input as WriteInputByName["task.create"], timestamp, id)
    case "file.create":
      return createRecord("file", input as WriteInputByName["file.create"], timestamp, id)
    case "relation.create": {
      const relationInput = input as WriteInputByName["relation.create"]
      await assertRefExists(tx, relationInput.workspaceId, relationInput.from)
      await assertRefExists(tx, relationInput.workspaceId, relationInput.to)
      return createRecord("relation", relationInput, timestamp, id)
    }
    case "record.update": {
      const updateInput = input as WriteInputByName["record.update"]
      const current = await getRequired(tx, updateInput.workspaceId, updateInput.ref)
      return compactRecord({
        ...current,
        ...updateInput.patch,
        id: current.id,
        type: current.type,
        workspaceId: current.workspaceId,
        createdAt: current.createdAt,
        updatedAt: timestamp,
        version: current.version + 1,
      } as AnyRecord)
    }
    case "record.archive": {
      const archiveInput = input as WriteInputByName["record.archive"]
      const current = await getRequired(tx, archiveInput.workspaceId, archiveInput.ref)
      return compactRecord({
        ...current,
        archivedAt: timestamp,
        updatedAt: timestamp,
        version: current.version + 1,
      })
    }
    default:
      throw new Error(`Unsupported write: ${name satisfies never}`)
  }
}

function createRecord<T extends AnyRecord>(
  type: T["type"],
  input: CreateInput<T>,
  timestamp: string,
  id: () => string,
): T {
  const base: BaseRecord = {
    id: input.id ?? id(),
    type,
    workspaceId: input.workspaceId,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.createdBy,
    ownerId: input.ownerId,
    source: input.source ?? "manual",
    externalRefs: input.externalRefs,
    tags: input.tags,
    custom: input.custom,
    version: 1,
  }

  return compactRecord({ ...input, ...base } as T)
}

function createEvent(
  record: AnyRecord,
  writeName: WriteName,
  timestamp: string,
  writeId: string,
  id: () => string,
  options?: WriteOptions,
): CrmEvent {
  const verb = writeName === "record.update"
    ? "updated"
    : writeName === "record.archive"
    ? "archived"
    : "created"

  return compactObject({
    id: id(),
    schemaVersion: 1,
    workspaceId: record.workspaceId,
    name: `${record.type}.${verb}`,
    operation: writeName,
    recordRef: { type: record.type, id: record.id },
    recordVersion: record.version,
    record,
    occurredAt: timestamp,
    writeId,
    source: record.source,
    actorType: options?.context?.actor?.type,
    actorId: options?.context?.actor?.id,
    actorDisplayName: options?.context?.actor?.displayName,
    causationId: options?.context?.causationId,
    correlationId: options?.context?.correlationId,
    idempotencyKey: options?.idempotencyKey,
  })
}

async function readTimeline(
  tx: StorageTx,
  input: ReadInputByName["timeline.list"],
): Promise<AnyRecord[]> {
  const records = await tx.search({
    workspaceId: input.workspaceId,
    includeArchived: input.includeArchived,
    limit: input.limit ?? 100,
  })

  return records.filter((record) => isRelatedTo(record, input))
}

async function readRelations(
  tx: StorageTx,
  input: ReadInputByName["relation.list"],
): Promise<Relation[]> {
  const records = await tx.search({
    workspaceId: input.workspaceId,
    type: "relation",
    includeArchived: input.includeArchived,
    limit: input.limit ?? 100,
  })

  return records
    .filter((record): record is Relation => record.type === "relation")
    .filter((relation) => sameRef(relation.from, input) || sameRef(relation.to, input))
}

async function assertRefExists(
  tx: StorageTx,
  workspaceId: string,
  ref: EntityRef,
): Promise<void> {
  const record = await tx.get({ workspaceId, ...ref })
  if (!record) throw new CrmNotFoundError(ref)
}

async function getRequired(
  tx: StorageTx,
  workspaceId: string,
  ref: EntityRef,
): Promise<AnyRecord> {
  const record = await tx.get({ workspaceId, ...ref })
  if (!record) throw new CrmNotFoundError(ref)
  return record
}

function getPutOptions(
  name: WriteName,
  record: AnyRecord,
): { expectedVersion?: number } | undefined {
  if (name.endsWith(".create")) return { expectedVersion: 0 }
  if (name !== "record.update" && name !== "record.archive") return undefined
  return { expectedVersion: record.version - 1 }
}

function getWorkspaceId(input: WriteInputByName[WriteName]): string {
  const workspaceId = "workspaceId" in input ? input.workspaceId : undefined
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    throw new CrmKernelError(
      "workspace.required",
      "Write input must include workspaceId",
      "workspaceId",
    )
  }
  return workspaceId
}

function assertContextWorkspace(workspaceId: string, options?: WriteOptions): void {
  const contextWorkspaceId = options?.context?.workspaceId
  if (contextWorkspaceId && contextWorkspaceId !== workspaceId) {
    throw new CrmKernelError(
      "workspace.mismatch",
      "Write input workspaceId does not match execution context workspaceId",
      "workspaceId",
    )
  }
}

function isRelatedTo(record: AnyRecord, ref: EntityRef): boolean {
  if (record.type === ref.type && record.id === ref.id) return true

  const maybeRelated = "related" in record && Array.isArray(record.related) ? record.related : []
  const maybeParticipants = "participants" in record && Array.isArray(record.participants)
    ? record.participants
    : []

  if (record.type === "relation") {
    return sameRef(record.from, ref) || sameRef(record.to, ref)
  }

  return [...maybeRelated, ...maybeParticipants].some((candidate) => sameRef(candidate, ref))
}

function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.type === b.type && a.id === b.id
}

function randomId(): string {
  return crypto.randomUUID()
}

function compactRecord<T extends AnyRecord>(record: T): T {
  return compactObject(record)
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
