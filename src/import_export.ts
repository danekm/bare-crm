import type {
  AnyRecord,
  CrmKernel,
  EntityType,
  ExecutionContext,
  ExternalRef,
  ReadOptions,
  SearchInput,
  UpdateInput,
  WriteInputByName,
  WriteName,
  WriteOptions,
} from "./types.ts"

export type CreateWriteName = Exclude<WriteName, "record.update" | "record.archive">

export type ImportByExternalRefMode = "return_existing" | "update"

export type ImportByExternalRefRequest<W extends CreateWriteName = CreateWriteName> = {
  write: W
  input: WriteInputByName[W]
  externalRef: ExternalRef
  mode?: ImportByExternalRefMode
  updatePatch?: UpdateInput<AnyRecord>
  dryRun?: boolean
}

export type ImportExportOptions = {
  context?: ExecutionContext
  idempotencyKey?: string
}

export type ImportByExternalRefResult =
  | {
    status: "created" | "matched" | "updated"
    record: AnyRecord
    externalRef: ExternalRef
  }
  | {
    status: "dry_run"
    would: "create" | "match" | "update"
    existing?: AnyRecord
    input: WriteInputByName[CreateWriteName]
    externalRef: ExternalRef
  }

export type FindByExternalRefInput = {
  workspaceId: string
  externalRef: Pick<ExternalRef, "system" | "id">
  type?: EntityType
  includeArchived?: boolean
}

export type ExportRecordsInput = SearchInput & {
  includeRelations?: boolean
}

export type BareCrmExportLine = {
  kind: "record"
  schemaVersion: 1
  record: AnyRecord
}

export class ImportExportError extends Error {
  constructor(
    readonly code: "external_ref.required" | "external_ref.ambiguous",
    message: string,
  ) {
    super(message)
    this.name = "ImportExportError"
  }
}

export async function findByExternalRef(
  crm: CrmKernel,
  input: FindByExternalRefInput,
  options?: ReadOptions,
): Promise<AnyRecord | null> {
  assertExternalRef(input.externalRef)

  const matches = await crm.read(
    "record.search",
    {
      workspaceId: input.workspaceId,
      type: input.type,
      includeArchived: input.includeArchived,
      externalRef: input.externalRef,
      limit: 2,
    },
    options,
  )

  if (matches.length > 1) {
    throw new ImportExportError(
      "external_ref.ambiguous",
      `External reference matched multiple records: ${input.externalRef.system}:${input.externalRef.id}`,
    )
  }

  return matches[0] ?? null
}

export async function importByExternalRef<W extends CreateWriteName>(
  crm: CrmKernel,
  request: ImportByExternalRefRequest<W>,
  options: ImportExportOptions = {},
): Promise<ImportByExternalRefResult> {
  assertExternalRef(request.externalRef)

  const write = request.write
  const type = typeFromCreateWrite(write)
  const input = withExternalRefDefaults(request.input, request.externalRef)
  const existing = await findByExternalRef(
    crm,
    {
      workspaceId: input.workspaceId,
      type,
      externalRef: request.externalRef,
    },
    { context: options.context },
  )
  const mode = request.mode ?? "return_existing"

  if (request.dryRun) {
    return {
      status: "dry_run",
      would: existing ? mode === "update" ? "update" : "match" : "create",
      existing: existing ?? undefined,
      input,
      externalRef: request.externalRef,
    }
  }

  if (existing && mode !== "update") {
    return { status: "matched", record: existing, externalRef: request.externalRef }
  }

  if (existing) {
    const patch = {
      ...request.updatePatch,
      externalRefs: mergeExternalRefs(existing.externalRefs, request.externalRef),
    } as UpdateInput<AnyRecord>
    const record = await crm.write(
      "record.update",
      {
        workspaceId: existing.workspaceId,
        ref: { type: existing.type, id: existing.id },
        patch,
      },
      writeOptions(options, request.externalRef, "update"),
    )

    return { status: "updated", record, externalRef: request.externalRef }
  }

  const record = await crm.write(
    write,
    input,
    writeOptions(options, request.externalRef, "create"),
  )

  return { status: "created", record, externalRef: request.externalRef }
}

export async function exportRecords(
  crm: CrmKernel,
  input: ExportRecordsInput,
  options?: ReadOptions,
): Promise<AnyRecord[]> {
  const records = await crm.read("record.search", input, options)
  if (!input.includeRelations) return records

  const relations = await crm.read(
    "record.search",
    {
      workspaceId: input.workspaceId,
      type: "relation",
      includeArchived: input.includeArchived,
      limit: input.limit,
    },
    options,
  )

  const seen = new Set(records.map(recordKey))
  return [
    ...records,
    ...relations.filter((record) => !seen.has(recordKey(record))),
  ]
}

export async function exportJsonLines(
  crm: CrmKernel,
  input: ExportRecordsInput,
  options?: ReadOptions,
): Promise<string> {
  const records = await exportRecords(crm, input, options)
  if (records.length === 0) return ""

  return records
    .map((record): BareCrmExportLine => ({ kind: "record", schemaVersion: 1, record }))
    .map((line) => JSON.stringify(line))
    .join("\n") + "\n"
}

export function mergeExternalRefs(
  existing: ExternalRef[] | undefined,
  incoming: ExternalRef,
): ExternalRef[] {
  assertExternalRef(incoming)

  const normalized = normalizeExternalRef(incoming)
  const refs = existing ?? []
  const alreadyPresent = refs.some((ref) =>
    ref.system === normalized.system && ref.id === normalized.id
  )

  return alreadyPresent ? refs : [...refs, normalized]
}

function withExternalRefDefaults<W extends CreateWriteName>(
  input: WriteInputByName[W],
  externalRef: ExternalRef,
): WriteInputByName[W] {
  const createInput = input as WriteInputByName[CreateWriteName]

  return {
    ...createInput,
    source: createInput.source ?? "import",
    externalRefs: mergeExternalRefs(createInput.externalRefs, externalRef),
  } as WriteInputByName[W]
}

function writeOptions(
  options: ImportExportOptions,
  externalRef: ExternalRef,
  action: "create" | "update",
): WriteOptions {
  return {
    context: options.context,
    idempotencyKey: options.idempotencyKey ??
      `external-ref:${action}:${externalRef.system}:${externalRef.id}`,
  }
}

function normalizeExternalRef(externalRef: ExternalRef): ExternalRef {
  return {
    ...externalRef,
    kind: externalRef.kind ?? "source",
  }
}

function assertExternalRef(externalRef: Pick<ExternalRef, "system" | "id">): void {
  if (!externalRef.system || !externalRef.id) {
    throw new ImportExportError(
      "external_ref.required",
      "External reference must include system and id",
    )
  }
}

function typeFromCreateWrite(write: CreateWriteName): EntityType {
  return write.slice(0, write.indexOf(".")) as EntityType
}

function recordKey(record: AnyRecord): string {
  return `${record.workspaceId}:${record.type}:${record.id}`
}
