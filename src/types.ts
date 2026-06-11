export type EntityType =
  | "person"
  | "company"
  | "deal"
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
  source?: SourceKind
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
  | Activity
  | Note
  | Task
  | FileRecord
  | Relation

export type CreateInput<T extends AnyRecord> =
  & Omit<T, keyof BaseRecord | "type">
  & Partial<
    Pick<BaseRecord<T["type"]>, "id" | "createdBy" | "ownerId" | "source" | "tags" | "custom">
  >
  & {
    workspaceId: string
  }

export type UpdateInput<T extends AnyRecord> = Partial<
  Omit<T, "id" | "type" | "workspaceId" | "createdAt" | "updatedAt" | "version">
>

export type CommandInputByName = {
  "person.create": CreateInput<Person>
  "company.create": CreateInput<Company>
  "deal.create": CreateInput<Deal>
  "activity.create": CreateInput<Activity>
  "note.create": CreateInput<Note>
  "task.create": CreateInput<Task>
  "file.create": CreateInput<FileRecord>
  "relation.create": CreateInput<Relation>
  "record.update": { ref: EntityRef; patch: UpdateInput<AnyRecord> }
  "record.archive": { ref: EntityRef }
}

export type CommandName = keyof CommandInputByName

export type QueryInputByName = {
  "record.get": EntityRef & { workspaceId: string }
  "record.search": {
    workspaceId: string
    type?: EntityType
    text?: string
    includeArchived?: boolean
    limit?: number
  }
  "timeline.list": EntityRef & { workspaceId: string }
  "event.list": { workspaceId: string; limit?: number }
}

export type QueryResultByName = {
  "record.get": AnyRecord | null
  "record.search": AnyRecord[]
  "timeline.list": AnyRecord[]
  "event.list": CrmEvent[]
}

export type QueryName = keyof QueryInputByName

export type CrmEvent = {
  id: string
  workspaceId: string
  name: `${EntityType}.${"created" | "updated" | "archived"}`
  record: AnyRecord
  occurredAt: string
  causationId?: string
}

export type PolicyContext = {
  command: CommandName
  input: unknown
}

export type PolicyResult =
  | { ok: true; warnings?: PolicyWarning[] }
  | { ok: false; code: string; message: string; field?: string; suggestedFix?: unknown }

export type PolicyWarning = {
  code: string
  message: string
  field?: string
}

export type Policy = {
  id: string
  appliesTo: CommandName[]
  mode: "blocking" | "warning"
  priority?: number
  evaluate: (context: PolicyContext) => PolicyResult | Promise<PolicyResult>
}

export type Workflow = {
  id: string
  trigger: CrmEvent["name"] | "*"
  run: (context: { event: CrmEvent; crm: CrmKernel }) => void | Promise<void>
}

export type CrmKernel = {
  command<C extends CommandName>(
    command: C,
    input: CommandInputByName[C],
  ): Promise<AnyRecord>
  query<Q extends QueryName>(
    query: Q,
    input: QueryInputByName[Q],
  ): Promise<QueryResultByName[Q]>
  policy(policy: Policy): void
  workflow(workflow: Workflow): void
}
