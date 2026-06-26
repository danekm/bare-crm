import type { EntityType, WriteInputByName, WriteName } from "./types.ts"

export class WriteValidationError extends Error {
  constructor(readonly code: string, message: string, readonly field: string) {
    super(message)
    this.name = "WriteValidationError"
  }
}

const entityTypes = [
  "person",
  "company",
  "deal",
  "collection",
  "activity",
  "note",
  "task",
  "file",
  "relation",
] as const

const sourceKinds = ["manual", "import", "plugin", "sync", "agent"] as const
const externalRefKinds = ["source", "dedupe", "canonical"] as const
const personStatuses = ["lead", "active", "inactive", "do_not_contact"] as const
const companyStatuses = ["prospect", "customer", "partner", "vendor", "inactive"] as const
const dealStatuses = ["open", "won", "lost", "paused"] as const
const activityKinds = [
  "email",
  "call",
  "meeting",
  "message",
  "note",
  "task_completed",
  "custom",
] as const
const activityDirections = ["inbound", "outbound", "internal"] as const
const taskStatuses = ["todo", "doing", "done", "canceled"] as const
const taskPriorities = ["low", "normal", "high", "urgent"] as const

const baseCreateFields = [
  "workspaceId",
  "id",
  "createdBy",
  "ownerId",
  "source",
  "externalRefs",
  "tags",
  "custom",
] as const

const createFieldsByOperation: Record<
  Exclude<WriteName, "record.update" | "record.archive">,
  Set<string>
> = {
  "person.create": fieldSet([
    ...baseCreateFields,
    "name",
    "emails",
    "phones",
    "title",
    "companyId",
    "location",
    "avatarUrl",
    "status",
    "lastContactedAt",
  ]),
  "company.create": fieldSet([
    ...baseCreateFields,
    "name",
    "domains",
    "industry",
    "size",
    "revenue",
    "location",
    "parentCompanyId",
    "status",
  ]),
  "deal.create": fieldSet([
    ...baseCreateFields,
    "name",
    "companyId",
    "personIds",
    "stage",
    "status",
    "value",
    "currency",
    "probability",
    "expectedCloseAt",
    "closedAt",
    "pipelineId",
  ]),
  "collection.create": fieldSet([
    ...baseCreateFields,
    "title",
    "kind",
    "status",
    "related",
    "outcome",
  ]),
  "activity.create": fieldSet([
    ...baseCreateFields,
    "kind",
    "subject",
    "body",
    "occurredAt",
    "direction",
    "participants",
    "related",
  ]),
  "note.create": fieldSet([
    ...baseCreateFields,
    "body",
    "related",
    "pinned",
  ]),
  "task.create": fieldSet([
    ...baseCreateFields,
    "title",
    "body",
    "status",
    "dueAt",
    "assigneeId",
    "priority",
    "related",
  ]),
  "file.create": fieldSet([
    ...baseCreateFields,
    "filename",
    "mimeType",
    "size",
    "storageKey",
    "checksum",
    "related",
  ]),
  "relation.create": fieldSet([
    ...baseCreateFields,
    "from",
    "to",
    "kind",
    "strength",
  ]),
}

const patchFields = new Set([
  "archivedAt",
  "createdBy",
  "ownerId",
  "source",
  "externalRefs",
  "tags",
  "custom",
  "name",
  "emails",
  "phones",
  "title",
  "companyId",
  "location",
  "avatarUrl",
  "status",
  "lastContactedAt",
  "domains",
  "industry",
  "size",
  "revenue",
  "parentCompanyId",
  "personIds",
  "stage",
  "value",
  "currency",
  "probability",
  "expectedCloseAt",
  "closedAt",
  "pipelineId",
  "kind",
  "related",
  "outcome",
  "subject",
  "body",
  "occurredAt",
  "direction",
  "participants",
  "pinned",
  "dueAt",
  "assigneeId",
  "priority",
  "filename",
  "mimeType",
  "storageKey",
  "checksum",
  "from",
  "to",
  "strength",
])

const identityPatchFields = new Set([
  "id",
  "type",
  "workspaceId",
  "createdAt",
  "updatedAt",
  "version",
])

export function validateWriteInput<W extends WriteName>(
  name: W,
  input: WriteInputByName[W],
): void {
  assertRecord(input, "input")
  const record = input as Record<string, unknown>

  switch (name) {
    case "person.create":
      validateCreateInput(name, record, ["workspaceId", "name"])
      assertOptionalEnum(record.status, personStatuses, "status")
      assertOptionalContactArray(record.emails, "emails")
      assertOptionalContactArray(record.phones, "phones")
      assertOptionalStringArray(record.tags, "tags")
      break
    case "company.create":
      validateCreateInput(name, record, ["workspaceId", "name"])
      assertOptionalEnum(record.status, companyStatuses, "status")
      assertOptionalStringArray(record.domains, "domains")
      assertOptionalStringArray(record.tags, "tags")
      assertOptionalNumber(record.size, "size")
      assertOptionalNumber(record.revenue, "revenue")
      break
    case "deal.create":
      validateCreateInput(name, record, ["workspaceId", "name", "stage", "status"])
      assertEnum(record.status, dealStatuses, "status")
      assertOptionalStringArray(record.personIds, "personIds")
      assertOptionalStringArray(record.tags, "tags")
      assertOptionalNumber(record.value, "value")
      assertOptionalNumber(record.probability, "probability")
      break
    case "collection.create":
      validateCreateInput(name, record, ["workspaceId", "title", "kind"])
      assertOptionalEntityRefArray(record.related, "related")
      assertCollectionOutcome(record.outcome)
      assertOptionalStringArray(record.tags, "tags")
      break
    case "activity.create":
      validateCreateInput(name, record, ["workspaceId", "kind", "occurredAt"])
      assertEnum(record.kind, activityKinds, "kind")
      assertOptionalEnum(record.direction, activityDirections, "direction")
      assertOptionalEntityRefArray(record.participants, "participants")
      assertOptionalEntityRefArray(record.related, "related")
      assertOptionalStringArray(record.tags, "tags")
      break
    case "note.create":
      validateCreateInput(name, record, ["workspaceId", "body", "related"])
      assertEntityRefArray(record.related, "related")
      assertOptionalBoolean(record.pinned, "pinned")
      assertOptionalStringArray(record.tags, "tags")
      break
    case "task.create":
      validateCreateInput(name, record, ["workspaceId", "title", "status"])
      assertEnum(record.status, taskStatuses, "status")
      assertOptionalEnum(record.priority, taskPriorities, "priority")
      assertOptionalEntityRefArray(record.related, "related")
      assertOptionalStringArray(record.tags, "tags")
      break
    case "file.create":
      validateCreateInput(name, record, [
        "workspaceId",
        "filename",
        "mimeType",
        "size",
        "storageKey",
      ])
      assertNumber(record.size, "size")
      assertOptionalEntityRefArray(record.related, "related")
      assertOptionalStringArray(record.tags, "tags")
      break
    case "relation.create":
      validateCreateInput(name, record, ["workspaceId", "from", "to", "kind"])
      assertEntityRef(record.from, "from")
      assertEntityRef(record.to, "to")
      assertOptionalNumber(record.strength, "strength")
      assertOptionalStringArray(record.tags, "tags")
      break
    case "record.update":
      validateUpdateInput(record)
      break
    case "record.archive":
      validateArchiveInput(record)
      break
    default:
      throw new Error(`Unsupported write validation: ${name satisfies never}`)
  }
}

function validateCreateInput(
  name: Exclude<WriteName, "record.update" | "record.archive">,
  input: Record<string, unknown>,
  requiredFields: string[],
): void {
  assertAllowedFields(input, createFieldsByOperation[name], name)
  for (const field of requiredFields) assertPresent(input[field], field)
  assertString(input.workspaceId, "workspaceId")
  assertOptionalString(input.id, "id")
  assertOptionalString(input.createdBy, "createdBy")
  assertOptionalString(input.ownerId, "ownerId")
  assertOptionalEnum(input.source, sourceKinds, "source")
  assertExternalRefs(input.externalRefs)
  assertOptionalPlainObject(input.custom, "custom")
  assertOptionalStringArray(input.tags, "tags")
}

function validateUpdateInput(input: Record<string, unknown>): void {
  assertAllowedFields(input, fieldSet(["workspaceId", "ref", "patch"]), "record.update")
  assertString(input.workspaceId, "workspaceId")
  assertEntityRef(input.ref, "ref")
  assertRecord(input.patch, "patch")

  for (const key of Object.keys(input.patch)) {
    if (identityPatchFields.has(key)) {
      throw invalid(
        "write.identity_field_forbidden",
        `Update patch cannot change ${key}`,
        `patch.${key}`,
      )
    }
    if (!patchFields.has(key)) {
      throw invalid("write.field_unknown", `Unknown update patch field: ${key}`, `patch.${key}`)
    }
  }

  const patch = input.patch
  assertOptionalEnum(patch.source, sourceKinds, "patch.source")
  assertExternalRefs(patch.externalRefs, "patch.externalRefs")
  assertOptionalPlainObject(patch.custom, "patch.custom")
  assertOptionalStringArray(patch.tags, "patch.tags")
  assertOptionalContactArray(patch.emails, "patch.emails")
  assertOptionalContactArray(patch.phones, "patch.phones")
  assertOptionalEnum(patch.direction, activityDirections, "patch.direction")
  assertOptionalEnum(patch.priority, taskPriorities, "patch.priority")
  assertOptionalEntityRefArray(patch.related, "patch.related")
  assertOptionalEntityRefArray(patch.participants, "patch.participants")
  assertCollectionOutcome(patch.outcome, "patch.outcome")
  assertOptionalEntityRef(patch.from, "patch.from")
  assertOptionalEntityRef(patch.to, "patch.to")
}

function validateArchiveInput(input: Record<string, unknown>): void {
  assertAllowedFields(input, fieldSet(["workspaceId", "ref"]), "record.archive")
  assertString(input.workspaceId, "workspaceId")
  assertEntityRef(input.ref, "ref")
}

function assertAllowedFields(
  input: Record<string, unknown>,
  allowed: Set<string>,
  operation: string,
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw invalid("write.field_unknown", `Unknown field for ${operation}: ${key}`, key)
    }
  }
}

function assertCollectionOutcome(value: unknown, field = "outcome"): void {
  if (value === undefined) return
  assertRecord(value, field)
  assertAllowedFields(value, fieldSet(["code", "summary", "occurredAt", "related"]), field)
  assertString(value.code, `${field}.code`)
  assertOptionalString(value.summary, `${field}.summary`)
  assertOptionalString(value.occurredAt, `${field}.occurredAt`)
  assertOptionalEntityRefArray(value.related, `${field}.related`)
}

function assertExternalRefs(value: unknown, field = "externalRefs"): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw invalid("write.field_invalid", `${field} must be an array`, field)
  }
  for (const [index, ref] of value.entries()) {
    const path = `${field}.${index}`
    assertRecord(ref, path)
    assertAllowedFields(ref, fieldSet(["system", "id", "url", "kind", "lastSeenAt"]), path)
    assertString(ref.system, `${path}.system`)
    assertString(ref.id, `${path}.id`)
    assertOptionalString(ref.url, `${path}.url`)
    assertOptionalString(ref.lastSeenAt, `${path}.lastSeenAt`)
    assertOptionalEnum(ref.kind, externalRefKinds, `${path}.kind`)
  }
}

function assertEntityRefArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throw invalid("write.field_invalid", `${field} must be an array`, field)
  }
  for (const [index, ref] of value.entries()) assertEntityRef(ref, `${field}.${index}`)
}

function assertOptionalEntityRefArray(value: unknown, field: string): void {
  if (value !== undefined) assertEntityRefArray(value, field)
}

function assertEntityRef(value: unknown, field: string): void {
  assertRecord(value, field)
  assertAllowedFields(value, fieldSet(["type", "id"]), field)
  assertEnum(value.type, entityTypes, `${field}.type`)
  assertString(value.id, `${field}.id`)
}

function assertOptionalEntityRef(value: unknown, field: string): void {
  if (value !== undefined) assertEntityRef(value, field)
}

function assertOptionalContactArray(value: unknown, field: string): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw invalid("write.field_invalid", `${field} must be an array`, field)
  }
  for (const [index, item] of value.entries()) {
    const path = `${field}.${index}`
    assertRecord(item, path)
    assertAllowedFields(item, fieldSet(["value", "label", "primary"]), path)
    assertString(item.value, `${path}.value`)
    assertOptionalString(item.label, `${path}.label`)
    assertOptionalBoolean(item.primary, `${path}.primary`)
  }
}

function assertOptionalStringArray(value: unknown, field: string): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw invalid("write.field_invalid", `${field} must be an array`, field)
  }
  for (const [index, item] of value.entries()) assertString(item, `${field}.${index}`)
}

function assertPresent(value: unknown, field: string): void {
  if (value === undefined) {
    throw invalid("write.field_required", `Write input must include ${field}`, field)
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalid("write.field_invalid", `${field} must be a non-empty string`, field)
  }
}

function assertOptionalString(value: unknown, field: string): void {
  if (value !== undefined) assertString(value, field)
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid("write.field_invalid", `${field} must be a finite number`, field)
  }
}

function assertOptionalNumber(value: unknown, field: string): void {
  if (value !== undefined) assertNumber(value, field)
}

function assertOptionalBoolean(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw invalid("write.field_invalid", `${field} must be a boolean`, field)
  }
}

function assertEnum<T extends readonly string[]>(value: unknown, allowed: T, field: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw invalid("write.field_invalid", `${field} must be one of: ${allowed.join(", ")}`, field)
  }
}

function assertOptionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): void {
  if (value !== undefined) assertEnum(value, allowed, field)
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw invalid("write.field_invalid", `${field} must be an object`, field)
  }
}

function assertOptionalPlainObject(value: unknown, field: string): void {
  if (value !== undefined && !isPlainObject(value)) {
    throw invalid("write.field_invalid", `${field} must be an object`, field)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]"
}

function fieldSet(fields: readonly string[]): Set<string> {
  return new Set(fields)
}

function invalid(code: string, message: string, field: string): WriteValidationError {
  return new WriteValidationError(code, message, field)
}
