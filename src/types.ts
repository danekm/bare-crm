export type EntityType =
  | "person"
  | "company"
  | "deal"
  | "collection"
  | "activity"
  | "note"
  | "task"
  | "file"
  | "relation"

export type SourceKind = "manual" | "import" | "plugin" | "sync" | "agent"

export type ExternalRef = {
  system: string
  id: string
  url?: string
  kind?: "source" | "dedupe" | "canonical"
  lastSeenAt?: string
}

export type EntityRef<T extends EntityType = EntityType> = {
  type: T
  id: string
}

export type BaseRecord<T extends EntityType = EntityType> = {
  id: string
  type: T
  workspaceId: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
  createdBy?: string
  ownerId?: string
  source: SourceKind
  externalRefs?: ExternalRef[]
  tags?: string[]
  custom?: Record<string, unknown>
  version: number
}

export type Email = {
  value: string
  label?: string
  primary?: boolean
}

export type Phone = {
  value: string
  label?: string
  primary?: boolean
}

export type Person = BaseRecord<"person"> & {
  name: string
  emails?: Email[]
  phones?: Phone[]
  title?: string
  companyId?: string
  location?: string
  avatarUrl?: string
  status?: "lead" | "active" | "inactive" | "do_not_contact"
  lastContactedAt?: string
}

export type Company = BaseRecord<"company"> & {
  name: string
  domains?: string[]
  industry?: string
  size?: number
  revenue?: number
  location?: string
  parentCompanyId?: string
  status?: "prospect" | "customer" | "partner" | "vendor" | "inactive"
}

export type Deal = BaseRecord<"deal"> & {
  name: string
  companyId?: string
  personIds?: string[]
  stage: string
  status: "open" | "won" | "lost" | "paused"
  value?: number
  currency?: string
  probability?: number
  expectedCloseAt?: string
  closedAt?: string
  pipelineId?: string
}

export type CollectionOutcome = {
  code: string
  summary?: string
  occurredAt?: string
  related?: EntityRef[]
}

export type Collection = BaseRecord<"collection"> & {
  title: string
  kind: string
  status?: string
  related?: EntityRef[]
  outcome?: CollectionOutcome
}

export type Activity = BaseRecord<"activity"> & {
  kind: "email" | "call" | "meeting" | "message" | "note" | "task_completed" | "custom"
  subject?: string
  body?: string
  occurredAt: string
  direction?: "inbound" | "outbound" | "internal"
  participants?: EntityRef[]
  related?: EntityRef[]
}

export type Note = BaseRecord<"note"> & {
  body: string
  related: EntityRef[]
  pinned?: boolean
}

export type Task = BaseRecord<"task"> & {
  title: string
  body?: string
  status: "todo" | "doing" | "done" | "canceled"
  dueAt?: string
  assigneeId?: string
  priority?: "low" | "normal" | "high" | "urgent"
  related?: EntityRef[]
}

export type FileRecord = BaseRecord<"file"> & {
  filename: string
  mimeType: string
  size: number
  storageKey: string
  checksum?: string
  related?: EntityRef[]
}

export type Relation = BaseRecord<"relation"> & {
  from: EntityRef
  to: EntityRef
  kind: string
  strength?: number
}

export type AnyRecord =
  | Person
  | Company
  | Deal
  | Collection
  | Activity
  | Note
  | Task
  | FileRecord
  | Relation

export type CreateInput<T extends AnyRecord> =
  & Omit<T, keyof BaseRecord | "type">
  & Partial<
    Pick<
      BaseRecord<T["type"]>,
      | "id"
      | "createdBy"
      | "ownerId"
      | "source"
      | "externalRefs"
      | "tags"
      | "custom"
    >
  >
  & {
    workspaceId: string
  }

export type UpdateInput<T extends AnyRecord> = T extends AnyRecord ? Partial<
    Omit<T, "id" | "type" | "workspaceId" | "createdAt" | "updatedAt" | "version">
  >
  : never

export type WriteInputByName = {
  "person.create": CreateInput<Person>
  "company.create": CreateInput<Company>
  "deal.create": CreateInput<Deal>
  "collection.create": CreateInput<Collection>
  "activity.create": CreateInput<Activity>
  "note.create": CreateInput<Note>
  "task.create": CreateInput<Task>
  "file.create": CreateInput<FileRecord>
  "relation.create": CreateInput<Relation>
  "record.update": { workspaceId: string; ref: EntityRef; patch: UpdateInput<AnyRecord> }
  "record.archive": { workspaceId: string; ref: EntityRef }
}

export type WriteName = keyof WriteInputByName

export type WriteResultByName = {
  [K in WriteName]: AnyRecord
}

export type ReadInputByName = {
  "record.get": EntityRef & { workspaceId: string }
  "record.search": SearchInput
  "timeline.list": EntityRef & { workspaceId: string; includeArchived?: boolean; limit?: number }
  "relation.list": EntityRef & { workspaceId: string; includeArchived?: boolean; limit?: number }
  "event.list": EventListInput
}

export type ReadResultByName = {
  "record.get": AnyRecord | null
  "record.search": AnyRecord[]
  "timeline.list": AnyRecord[]
  "relation.list": Relation[]
  "event.list": CrmEvent[]
}

export type ReadName = keyof ReadInputByName

export type SearchInput = {
  workspaceId: string
  type?: EntityType
  text?: string
  includeArchived?: boolean
  limit?: number
  tags?: string[]
  ownerId?: string
  source?: SourceKind
  externalRef?: Pick<ExternalRef, "system" | "id">
}

export type EventListInput = {
  workspaceId: string
  limit?: number
  name?: CrmEventName
  record?: EntityRef
  writeId?: string
  actorId?: string
  source?: SourceKind
  causationId?: string
  correlationId?: string
  idempotencyKey?: string
}

export type CrmEventName = `${EntityType}.${"created" | "updated" | "archived"}`

export type CrmEvent = {
  id: string
  schemaVersion: 1
  workspaceId: string
  name: CrmEventName
  operation: WriteName
  recordRef: EntityRef
  recordVersion: number
  record: AnyRecord
  occurredAt: string
  writeId: string
  source: SourceKind
  actorType?: ActorType
  actorId?: string
  actorDisplayName?: string
  causationId?: string
  correlationId?: string
  idempotencyKey?: string
}

export type ActorType = "human" | "plugin" | "agent" | "sync" | "system"

export type Capability =
  | "crm:*"
  | "crm:read"
  | "crm:write"
  | `crm:read:${ReadName}`
  | `crm:write:${WriteName}`

export type ExecutionContext = {
  workspaceId: string
  actor?: {
    type: ActorType
    id: string
    displayName?: string
  }
  capabilities?: Capability[]
  causationId?: string
  correlationId?: string
}

export type WriteOptions = {
  context?: ExecutionContext
  idempotencyKey?: string
}

export type ReadOptions = {
  context?: ExecutionContext
}

export type WriteDraft = {
  name: WriteName
  input: WriteInputByName[WriteName]
}

export type KernelErrorShape = {
  code: string
  message: string
  field?: string
  retryable?: boolean
  requiredCapability?: Capability
  suggestedFix?: WriteDraft
}

export type CrmKernel = {
  write<W extends WriteName>(
    name: W,
    input: WriteInputByName[W],
    options?: WriteOptions,
  ): Promise<WriteResultByName[W]>
  read<R extends ReadName>(
    name: R,
    input: ReadInputByName[R],
    options?: ReadOptions,
  ): Promise<ReadResultByName[R]>
}
