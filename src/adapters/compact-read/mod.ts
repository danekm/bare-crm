import type {
  AnyRecord,
  CrmEvent,
  CrmKernel,
  EventListInput,
  ReadInputByName,
  ReadOptions,
  SearchInput,
} from "../../types.ts"

const DEFAULT_COMPACT_LIMIT = 25
const MAX_COMPACT_LIMIT = 100
const COMPACT_SCAN_LIMIT = 100_000

export type CompactReadOperation = "record.search" | "timeline.list" | "event.list"

export type CompactReadInputByOperation = {
  "record.search": SearchInput
  "timeline.list": ReadInputByName["timeline.list"]
  "event.list": EventListInput
}

export type CompactReadRequest<O extends CompactReadOperation = CompactReadOperation> = {
  operation: O
  input: CompactReadInputByOperation[O]
}

export type CompactReadMode = "full" | "summary" | "fields"

export type CompactReadOptions = {
  limit?: number
  cursor?: string
  fields?: string[]
  summary?: boolean
  tokenBudget?: number
  readOptions?: ReadOptions
}

export type CompactReadPageInfo = {
  limit: number
  returned: number
  hasMore: boolean
  mode: CompactReadMode
  estimatedTokens: number
  tokenBudget?: number
}

export type CompactReadPage = {
  items: Array<Record<string, unknown>>
  nextCursor?: string
  pageInfo: CompactReadPageInfo
}

type CompactCursor = {
  v: 1
  operation: CompactReadOperation
  offset: number
}

export class CompactReadError extends Error {
  constructor(
    readonly code: "compact_read.cursor_invalid",
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = "CompactReadError"
  }
}

export async function readCompact<O extends CompactReadOperation>(
  crm: CrmKernel,
  request: CompactReadRequest<O>,
  options: CompactReadOptions = {},
): Promise<CompactReadPage> {
  const limit = compactLimit(options.limit)
  const cursor = decodeCursor(options.cursor, request.operation)
  const readLimit = Math.min(COMPACT_SCAN_LIMIT, cursor.offset + limit + 1)
  const readItems = await readKernelItems(crm, request, readLimit, options.readOptions)

  return createCompactPage({
    items: readItems.slice(cursor.offset),
    cursor,
    limit,
    options,
  })
}

async function readKernelItems<O extends CompactReadOperation>(
  crm: CrmKernel,
  request: CompactReadRequest<O>,
  limit: number,
  readOptions?: ReadOptions,
): Promise<Array<AnyRecord | CrmEvent>> {
  switch (request.operation) {
    case "record.search":
      return await crm.read(
        "record.search",
        { ...request.input, limit } as SearchInput,
        readOptions,
      )
    case "timeline.list":
      return await crm.read(
        "timeline.list",
        { ...request.input, limit } as ReadInputByName["timeline.list"],
        readOptions,
      )
    case "event.list":
      return await crm.read(
        "event.list",
        { ...request.input, limit } as EventListInput,
        readOptions,
      )
    default:
      throw new Error(`Unsupported compact read: ${request.operation satisfies never}`)
  }
}

function createCompactPage(input: {
  items: Array<AnyRecord | CrmEvent>
  cursor: CompactCursor
  limit: number
  options: CompactReadOptions
}): CompactReadPage {
  const mode: CompactReadMode = input.options.fields?.length
    ? "fields"
    : input.options.summary
    ? "summary"
    : "full"
  const projected: Array<Record<string, unknown>> = []
  let estimatedTokens = 0

  for (const item of input.items) {
    if (projected.length >= input.limit) break
    const next = projectReadItem(item, input.options, mode)
    const nextTokens = estimateTokens(JSON.stringify(next))
    if (
      input.options.tokenBudget &&
      projected.length > 0 &&
      estimatedTokens + nextTokens > input.options.tokenBudget
    ) {
      break
    }
    projected.push(next)
    estimatedTokens += nextTokens
  }

  const hasMore = input.items.length > projected.length
  const nextCursor = hasMore
    ? encodeCursor({
      v: 1,
      operation: input.cursor.operation,
      offset: input.cursor.offset + projected.length,
    })
    : undefined

  return {
    items: projected,
    nextCursor,
    pageInfo: compactObject({
      limit: input.limit,
      returned: projected.length,
      hasMore,
      mode,
      estimatedTokens,
      tokenBudget: input.options.tokenBudget,
    }),
  }
}

function projectReadItem(
  item: AnyRecord | CrmEvent,
  options: CompactReadOptions,
  mode: CompactReadMode,
): Record<string, unknown> {
  if (mode === "fields") return pickFields(item, options.fields ?? [])
  if (mode === "summary") return summarizeReadItem(item)
  return { ...item } as Record<string, unknown>
}

function pickFields(item: AnyRecord | CrmEvent, fields: string[]): Record<string, unknown> {
  const source = item as unknown as Record<string, unknown>
  return compactObject(
    Object.fromEntries(fields.map((field) => [field, source[field]])),
  )
}

function summarizeReadItem(item: AnyRecord | CrmEvent): Record<string, unknown> {
  if ("schemaVersion" in item) {
    const { record: _record, ...eventSummary } = item
    return compactObject(eventSummary)
  }

  return compactObject({
    id: item.id,
    type: item.type,
    workspaceId: item.workspaceId,
    name: "name" in item ? item.name : undefined,
    title: "title" in item ? item.title : undefined,
    subject: "subject" in item ? item.subject : undefined,
    body: "body" in item && typeof item.body === "string"
      ? truncateText(item.body, 180)
      : undefined,
    kind: "kind" in item ? item.kind : undefined,
    status: "status" in item ? item.status : undefined,
    stage: "stage" in item ? item.stage : undefined,
    companyId: "companyId" in item ? item.companyId : undefined,
    personIds: "personIds" in item ? item.personIds : undefined,
    participants: "participants" in item ? item.participants : undefined,
    related: "related" in item ? item.related : undefined,
    occurredAt: "occurredAt" in item ? item.occurredAt : undefined,
    updatedAt: item.updatedAt,
  })
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

function compactLimit(limit: number | undefined): number {
  if (!limit || limit < 1) return DEFAULT_COMPACT_LIMIT
  return Math.min(Math.floor(limit), MAX_COMPACT_LIMIT)
}

function encodeCursor(cursor: CompactCursor): string {
  return btoa(JSON.stringify(cursor))
}

function decodeCursor(
  cursor: string | undefined,
  operation: CompactReadOperation,
): CompactCursor {
  if (!cursor) return { v: 1, operation, offset: 0 }
  try {
    const parsed = JSON.parse(atob(cursor)) as Partial<CompactCursor>
    if (
      parsed.v !== 1 ||
      parsed.operation !== operation ||
      typeof parsed.offset !== "number" ||
      parsed.offset < 0 ||
      !Number.isInteger(parsed.offset)
    ) {
      throw new Error("Invalid compact read cursor")
    }
    return parsed as CompactCursor
  } catch (_error) {
    throw new CompactReadError(
      "compact_read.cursor_invalid",
      "Compact read cursor is invalid for this operation.",
      "cursor",
    )
  }
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
