import { createCrmKernel } from "./kernel.ts"
import { createSqliteStorage, type SqliteStorage } from "./sqlite.ts"
import type {
  Activity,
  AnyRecord,
  Capability,
  CrmEvent,
  CrmKernel,
  Deal,
  EntityRef,
  EntityType,
  ExecutionContext,
  Note,
  Person,
  ReadOptions,
  Relation,
  Task,
  WriteInputByName,
  WriteName,
  WriteOptions,
} from "./types.ts"

export type DashboardActor = NonNullable<ExecutionContext["actor"]>

export type DashboardServerOptions = {
  crm: CrmKernel
  workspaceId?: string
  actor?: DashboardActor
  capabilities?: Capability[]
}

export type DashboardStartOptions = {
  dbPath?: string
  workspaceId?: string
  hostname?: string
  port?: number
  actor?: DashboardActor
}

export type DashboardRecordListItem = {
  ref: EntityRef
  title: string
  subtitle?: string
  eyebrow: string
  badges: string[]
  updatedAt: string
  archived: boolean
}

export type DashboardRecordDetail = DashboardRecordListItem & {
  fields: Array<{ label: string; value: string }>
  timeline: DashboardTimelineItem[]
  relations: DashboardRelationItem[]
}

export type DashboardTimelineItem = {
  ref: EntityRef
  title: string
  subtitle?: string
  kind: string
  occurredAt?: string
}

export type DashboardRelationItem = {
  ref: EntityRef<"relation">
  kind: string
  from: EntityRef
  to: EntityRef
  updatedAt: string
}

const defaultWorkspaceId = "workspace_1"
const defaultActor: DashboardActor = {
  type: "human",
  id: "local-dashboard",
  displayName: "Local dashboard",
}
const defaultCapabilities: Capability[] = ["crm:read", "crm:write"]
const creatableTypes = new Set<EntityType>([
  "person",
  "company",
  "deal",
  "collection",
  "task",
  "note",
  "activity",
])
const platformProfiles = [
  { key: "tickets", label: "Tickets", kind: "platform.ticket" },
  { key: "workflows", label: "Workflows", kind: "platform.workflow" },
  { key: "dependencies", label: "Dependencies", kind: "platform.dependency" },
  { key: "qa", label: "QA", kind: "platform.qa" },
] as const
const hostAuthBoundaryPaths = new Set(["/admin", "/admin/login", "/login"])
const hostAuthBoundaryMessage =
  "Bare CRM does not include admin login. Put the dashboard behind host authentication and construct trusted execution context server-side."

export function createDashboardHandler(
  options: DashboardServerOptions,
): (request: Request) => Promise<Response> {
  const workspaceId = options.workspaceId ?? defaultWorkspaceId
  const actor = options.actor ?? defaultActor
  const capabilities = options.capabilities ?? defaultCapabilities

  const context: ExecutionContext = {
    workspaceId,
    actor,
    capabilities,
  }
  const readOptions: ReadOptions = { context }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    try {
      if (request.method === "GET" && url.pathname === "/") return htmlResponse(indexHtml)
      if (hostAuthBoundaryPaths.has(url.pathname)) {
        return jsonError("dashboard.auth_not_implemented", hostAuthBoundaryMessage, 501)
      }
      if (request.method === "GET" && url.pathname === "/assets/dashboard.css") {
        return assetResponse(dashboardCss, "text/css; charset=utf-8")
      }
      if (request.method === "GET" && url.pathname === "/assets/dashboard.js") {
        return assetResponse(dashboardJs, "application/javascript; charset=utf-8")
      }

      if (request.method === "GET" && url.pathname === "/api/workbench/records") {
        const type = parseOptionalEntityType(url.searchParams.get("type"))
        const text = emptyToUndefined(url.searchParams.get("q"))
        const kind = emptyToUndefined(url.searchParams.get("kind"))
        const records = await options.crm.read(
          "record.search",
          { workspaceId, type, text, limit: kind ? 200 : 50 },
          readOptions,
        )
        return jsonResponse({
          ok: true,
          items: filterRecordsByKind(records, kind).slice(0, 50).map(toRecordListItem),
        })
      }

      if (request.method === "GET" && url.pathname === "/api/workbench/platform") {
        const collections = await options.crm.read(
          "record.search",
          { workspaceId, type: "collection", limit: 200 },
          readOptions,
        )
        const tasks = await options.crm.read(
          "record.search",
          { workspaceId, type: "task", limit: 100 },
          readOptions,
        )
        const events = await options.crm.read("event.list", { workspaceId, limit: 10 }, readOptions)

        return jsonResponse({
          ok: true,
          sections: platformProfiles.map((profile) => ({
            key: profile.key,
            label: profile.label,
            kind: profile.kind,
            items: filterRecordsByKind(collections, profile.kind).slice(0, 12).map(
              toRecordListItem,
            ),
          })),
          metrics: {
            openTickets: countCollections(collections, "platform.ticket", [
              "open",
              "active",
              "blocked",
            ]),
            activeWorkflows: countCollections(collections, "platform.workflow", [
              "active",
              "running",
            ]),
            unresolvedDependencies: countCollections(collections, "platform.dependency", [
              "open",
              "blocked",
              "waiting",
            ]),
            qaAtRisk: countCollections(collections, "platform.qa", [
              "blocked",
              "failing",
              "at_risk",
            ]),
            openTasks: tasks.filter((record): record is Task =>
              record.type === "task" && ["todo", "doing"].includes(record.status)
            ).length,
          },
          events: events.map(toEventMetadata),
        })
      }

      if (request.method === "POST" && url.pathname === "/api/workbench/records") {
        const body = await readJsonObject(request)
        const type = parseEntityType(body.type)
        if (!creatableTypes.has(type)) {
          return jsonError(
            "dashboard.unsupported_type",
            `Cannot create ${type} records from the dashboard.`,
            400,
          )
        }

        const data = objectValue(body.data)
        const name = `${type}.create` as WriteName
        const input = createRecordInput(type, workspaceId, data)
        const result = await options.crm.write(
          name,
          input as WriteInputByName[typeof name],
          writeOptions(context, stringValue(body.idempotencyKey)),
        )

        return jsonResponse({ ok: true, item: toRecordListItem(result) }, 201)
      }

      const recordMatch = matchRecordPath(url.pathname)
      if (recordMatch && request.method === "GET") {
        const record = await options.crm.read(
          "record.get",
          { workspaceId, ...recordMatch },
          readOptions,
        )
        if (!record) return jsonError("record.not_found", "Record not found.", 404)

        const timeline = await options.crm.read(
          "timeline.list",
          { workspaceId, ...recordMatch, limit: 25 },
          readOptions,
        )
        const relations = await options.crm.read(
          "relation.list",
          { workspaceId, ...recordMatch, limit: 25 },
          readOptions,
        )

        return jsonResponse({
          ok: true,
          detail: toRecordDetail(record, timeline, relations),
        })
      }

      if (recordMatch && request.method === "POST" && url.pathname.endsWith("/archive")) {
        const result = await options.crm.write(
          "record.archive",
          { workspaceId, ref: recordMatch },
          writeOptions(context, `dashboard:archive:${recordMatch.type}:${recordMatch.id}`),
        )
        return jsonResponse({ ok: true, item: toRecordListItem(result) })
      }

      if (request.method === "GET" && url.pathname === "/api/workbench/events") {
        const events = await options.crm.read("event.list", { workspaceId, limit: 25 }, readOptions)
        return jsonResponse({ ok: true, items: events.map(toEventMetadata) })
      }

      return jsonError("dashboard.not_found", "Route not found.", 404)
    } catch (error) {
      return jsonError(errorCode(error), safeMessage(error), errorStatus(error))
    }
  }
}

export function startDashboardServer(
  options: DashboardStartOptions = {},
): Deno.HttpServer<Deno.NetAddr> {
  const dbPath = options.dbPath ?? "./bare-crm.db"
  const storage = createSqliteStorage(dbPath)
  const crm = createCrmKernel({ storage, enforceCapabilities: true })
  const handler = createDashboardHandler({
    crm,
    workspaceId: options.workspaceId,
    actor: options.actor,
  })

  const server = Deno.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 8787,
    onListen: () => {},
  }, handler)

  closeStorageWhenFinished(server, storage)
  return server
}

function closeStorageWhenFinished(
  server: Deno.HttpServer<Deno.NetAddr>,
  storage: SqliteStorage,
): void {
  server.finished.finally(() => storage.close())
}

function writeOptions(context: ExecutionContext, idempotencyKey?: string): WriteOptions {
  return { context, idempotencyKey: idempotencyKey ?? crypto.randomUUID() }
}

function createRecordInput(
  type: EntityType,
  workspaceId: string,
  data: Record<string, unknown>,
): WriteInputByName[WriteName] {
  switch (type) {
    case "person": {
      const email = emptyToUndefined(stringValue(data.email))
      return {
        workspaceId,
        name: requiredString(data.name, "name"),
        emails: email ? [{ value: email, primary: true }] : undefined,
        title: emptyToUndefined(stringValue(data.title)),
        status: enumValue(data.status, ["lead", "active", "inactive", "do_not_contact"]),
        source: "manual",
      } satisfies WriteInputByName["person.create"]
    }
    case "company": {
      const domain = emptyToUndefined(stringValue(data.domain))
      return {
        workspaceId,
        name: requiredString(data.name, "name"),
        domains: domain ? [domain] : undefined,
        industry: emptyToUndefined(stringValue(data.industry)),
        status: enumValue(data.status, ["prospect", "customer", "partner", "vendor", "inactive"]),
        source: "manual",
      } satisfies WriteInputByName["company.create"]
    }
    case "deal":
      return {
        workspaceId,
        name: requiredString(data.name, "name"),
        stage: emptyToUndefined(stringValue(data.stage)) ?? "new",
        status: enumValue(data.status, ["open", "won", "lost", "paused"]) ?? "open",
        value: numberValue(data.value),
        currency: emptyToUndefined(stringValue(data.currency)) ?? undefined,
        source: "manual",
      } satisfies WriteInputByName["deal.create"]
    case "collection": {
      const kind = emptyToUndefined(stringValue(data.kind)) ?? "platform.ticket"
      const summary = emptyToUndefined(stringValue(data.summary))
      return {
        workspaceId,
        title: requiredString(data.title, "title"),
        kind,
        status: emptyToUndefined(stringValue(data.status)),
        related: [],
        tags: csvValues(data.tags),
        custom: summary
          ? {
            platform: {
              summary,
            },
          }
          : undefined,
        source: "manual",
      } satisfies WriteInputByName["collection.create"]
    }
    case "task":
      return {
        workspaceId,
        title: requiredString(data.title, "title"),
        status: enumValue(data.status, ["todo", "doing", "done", "canceled"]) ?? "todo",
        dueAt: emptyToUndefined(stringValue(data.dueAt)),
        priority: enumValue(data.priority, ["low", "normal", "high", "urgent"]) ?? "normal",
        source: "manual",
      } satisfies WriteInputByName["task.create"]
    case "note":
      return {
        workspaceId,
        body: requiredString(data.body, "body"),
        related: [],
        source: "manual",
      } satisfies WriteInputByName["note.create"]
    case "activity":
      return {
        workspaceId,
        kind: enumValue(data.kind, [
          "email",
          "call",
          "meeting",
          "message",
          "note",
          "task_completed",
          "custom",
        ]) ??
          "note",
        subject: emptyToUndefined(stringValue(data.subject)),
        body: emptyToUndefined(stringValue(data.body)),
        occurredAt: emptyToUndefined(stringValue(data.occurredAt)) ?? new Date().toISOString(),
        direction: enumValue(data.direction, ["inbound", "outbound", "internal"]),
        source: "manual",
      } satisfies WriteInputByName["activity.create"]
    default:
      throw new DashboardError(
        "dashboard.unsupported_type",
        `Cannot create ${type} records from the dashboard.`,
        400,
      )
  }
}

function toRecordListItem(record: AnyRecord): DashboardRecordListItem {
  return {
    ref: { type: record.type, id: record.id },
    title: recordTitle(record),
    subtitle: recordSubtitle(record),
    eyebrow: entityLabel(record.type),
    badges: recordBadges(record),
    updatedAt: record.updatedAt,
    archived: Boolean(record.archivedAt),
  }
}

function toRecordDetail(
  record: AnyRecord,
  timeline: AnyRecord[],
  relations: Relation[],
): DashboardRecordDetail {
  return {
    ...toRecordListItem(record),
    fields: recordFields(record),
    timeline: timeline.map(toTimelineItem),
    relations: relations.map((relation) => ({
      ref: { type: "relation", id: relation.id },
      kind: relation.kind,
      from: relation.from,
      to: relation.to,
      updatedAt: relation.updatedAt,
    })),
  }
}

function toTimelineItem(record: AnyRecord): DashboardTimelineItem {
  return {
    ref: { type: record.type, id: record.id },
    title: recordTitle(record),
    subtitle: recordSubtitle(record),
    kind: entityLabel(record.type),
    occurredAt: "occurredAt" in record && typeof record.occurredAt === "string"
      ? record.occurredAt
      : record.updatedAt,
  }
}

function toEventMetadata(event: CrmEvent): Omit<CrmEvent, "record"> {
  const { record: _record, ...metadata } = event
  return metadata
}

function filterRecordsByKind(records: AnyRecord[], kind?: string): AnyRecord[] {
  if (!kind) return records
  return records.filter((record) => record.type === "collection" && record.kind === kind)
}

function countCollections(records: AnyRecord[], kind: string, activeStatuses: string[]): number {
  return records.filter((record) =>
    record.type === "collection" && record.kind === kind &&
    (!record.status || activeStatuses.includes(record.status))
  ).length
}

function recordTitle(record: AnyRecord): string {
  switch (record.type) {
    case "person":
    case "company":
    case "deal":
      return record.name
    case "collection":
      return record.title
    case "task":
      return record.title
    case "note":
      return preview(record.body)
    case "activity":
      return record.subject ?? `${entityLabel(record.kind)} activity`
    case "file":
      return record.filename
    case "relation":
      return `${record.from.type}:${record.from.id} -> ${record.to.type}:${record.to.id}`
  }
}

function recordSubtitle(record: AnyRecord): string | undefined {
  switch (record.type) {
    case "person":
      return primaryEmail(record) ?? record.title ?? record.status
    case "company":
      return record.domains?.[0] ?? record.industry ?? record.status
    case "deal":
      return [record.stage, record.status, money(record)].filter(Boolean).join(" / ")
    case "task":
      return [record.status, record.dueAt ? `Due ${shortDate(record.dueAt)}` : undefined].filter(
        Boolean,
      ).join(" / ")
    case "note":
      return `${record.related.length} related`
    case "activity":
      return [record.kind, record.direction, shortDate(record.occurredAt)].filter(Boolean).join(
        " / ",
      )
    case "collection":
      return [record.kind, record.status].filter(Boolean).join(" / ")
    case "file":
      return `${record.mimeType} / ${record.size} bytes`
    case "relation":
      return record.kind
  }
}

function recordBadges(record: AnyRecord): string[] {
  const badges = [...(record.tags ?? [])]
  if ("status" in record && typeof record.status === "string") badges.unshift(record.status)
  if (record.archivedAt) badges.unshift("archived")
  return badges.slice(0, 4)
}

function recordFields(record: AnyRecord): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string | undefined }> = [
    { label: "ID", value: record.id },
    { label: "Type", value: entityLabel(record.type) },
    { label: "Source", value: record.source },
    { label: "Owner", value: record.ownerId },
    { label: "Created", value: shortDateTime(record.createdAt) },
    { label: "Updated", value: shortDateTime(record.updatedAt) },
  ]

  switch (record.type) {
    case "person":
      fields.unshift(
        { label: "Name", value: record.name },
        { label: "Email", value: primaryEmail(record) },
        { label: "Title", value: record.title },
        { label: "Status", value: record.status },
        { label: "Location", value: record.location },
      )
      break
    case "company":
      fields.unshift(
        { label: "Name", value: record.name },
        { label: "Domain", value: record.domains?.[0] },
        { label: "Industry", value: record.industry },
        { label: "Status", value: record.status },
        { label: "Location", value: record.location },
      )
      break
    case "deal":
      fields.unshift(
        { label: "Name", value: record.name },
        { label: "Stage", value: record.stage },
        { label: "Status", value: record.status },
        { label: "Value", value: money(record) },
        {
          label: "Expected close",
          value: record.expectedCloseAt ? shortDate(record.expectedCloseAt) : undefined,
        },
      )
      break
    case "task":
      fields.unshift(
        { label: "Title", value: record.title },
        { label: "Status", value: record.status },
        { label: "Priority", value: record.priority },
        { label: "Due", value: record.dueAt ? shortDate(record.dueAt) : undefined },
      )
      break
    case "note":
      fields.unshift({ label: "Body", value: record.body })
      break
    case "activity":
      fields.unshift(
        { label: "Kind", value: record.kind },
        { label: "Subject", value: record.subject },
        { label: "Direction", value: record.direction },
        { label: "Occurred", value: shortDateTime(record.occurredAt) },
      )
      break
    case "collection":
      fields.unshift(
        { label: "Title", value: record.title },
        { label: "Kind", value: record.kind },
        { label: "Status", value: record.status },
        { label: "Summary", value: platformSummary(record) },
        { label: "Related", value: String(record.related?.length ?? 0) },
      )
      break
  }

  return fields
    .filter((field): field is { label: string; value: string } => Boolean(field.value))
    .slice(0, 16)
}

function primaryEmail(record: Person): string | undefined {
  return record.emails?.find((email) => email.primary)?.value ?? record.emails?.[0]?.value
}

function money(record: Deal): string | undefined {
  if (record.value === undefined) return undefined
  return `${record.currency ?? "USD"} ${record.value.toLocaleString()}`
}

function platformSummary(record: { custom?: Record<string, unknown> }): string | undefined {
  const platform = record.custom?.platform
  if (!platform || typeof platform !== "object" || Array.isArray(platform)) return undefined
  const summary = (platform as Record<string, unknown>).summary
  return typeof summary === "string" ? summary : undefined
}

function preview(value: string): string {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value
}

function entityLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function shortDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function parseOptionalEntityType(value: string | null): EntityType | undefined {
  if (!value || value === "all") return undefined
  return parseEntityType(value)
}

function parseEntityType(value: unknown): EntityType {
  const candidate = stringValue(value)
  const valid: EntityType[] = [
    "person",
    "company",
    "deal",
    "collection",
    "activity",
    "note",
    "task",
    "file",
    "relation",
  ]
  if (valid.includes(candidate as EntityType)) return candidate as EntityType
  throw new DashboardError("dashboard.invalid_type", "Invalid record type.", 400)
}

function matchRecordPath(pathname: string): (EntityRef & { workspaceId?: never }) | null {
  const archiveSuffix = "/archive"
  const cleanPath = pathname.endsWith(archiveSuffix)
    ? pathname.slice(0, -archiveSuffix.length)
    : pathname
  const match = cleanPath.match(/^\/api\/workbench\/records\/([^/]+)\/([^/]+)$/)
  if (!match) return null
  return { type: parseEntityType(decodeURIComponent(match[1])), id: decodeURIComponent(match[2]) }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json()
  return objectValue(value)
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new DashboardError("dashboard.invalid_json", "Expected a JSON object.", 400)
}

function requiredString(value: unknown, field: string): string {
  const text = emptyToUndefined(stringValue(value))
  if (!text) {
    throw new DashboardError("dashboard.required", `Missing required field: ${field}.`, 400)
  }
  return text
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function csvValues(value: unknown): string[] | undefined {
  const values = stringValue(value).split(",").map((item) => item.trim()).filter(Boolean)
  return values.length ? values : undefined
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  const candidate = stringValue(value)
  return values.includes(candidate as T) ? candidate as T : undefined
}

function emptyToUndefined(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

function htmlResponse(body: string): Response {
  return assetResponse(body, "text/html; charset=utf-8")
}

function assetResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": contentType,
    },
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  })
}

function jsonError(code: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

function errorCode(error: unknown): string {
  return error instanceof DashboardError ? error.code : "dashboard.error"
}

function errorStatus(error: unknown): number {
  return error instanceof DashboardError ? error.status : 500
}

function safeMessage(error: unknown): string {
  if (error instanceof DashboardError) return error.message
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.message
  }
  return "Dashboard request failed."
}

class DashboardError extends Error {
  constructor(readonly code: string, message: string, readonly status = 500) {
    super(message)
    this.name = "DashboardError"
  }
}

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bare CRM Dashboard</title>
    <link rel="stylesheet" href="/assets/dashboard.css">
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div>
          <div class="eyebrow">Bare CRM</div>
          <h1>Workbench</h1>
        </div>
        <label class="search">
          <span>Search</span>
          <input id="search-input" autocomplete="off" placeholder="Name, email, company, task...">
        </label>
        <button id="new-record" class="button primary" type="button">New record</button>
      </header>

      <main class="layout">
        <nav class="sidebar" aria-label="Record types">
          <div class="nav-section">
            <div class="nav-label">Platform</div>
            <button class="nav-item active" data-view="platform">Overview</button>
            <button class="nav-item" data-type="collection" data-kind="platform.ticket">Tickets</button>
            <button class="nav-item" data-type="collection" data-kind="platform.workflow">Workflows</button>
            <button class="nav-item" data-type="collection" data-kind="platform.dependency">Dependencies</button>
            <button class="nav-item" data-type="collection" data-kind="platform.qa">QA</button>
          </div>
          <div class="nav-section">
            <div class="nav-label">CRM</div>
            <button class="nav-item" data-type="person">People</button>
            <button class="nav-item" data-type="company">Companies</button>
            <button class="nav-item" data-type="deal">Deals</button>
            <button class="nav-item" data-type="task">Tasks</button>
            <button class="nav-item" data-type="note">Notes</button>
            <button class="nav-item" data-type="activity">Activities</button>
            <button class="nav-item" data-type="all">All records</button>
          </div>
        </nav>

        <section class="records-panel" aria-label="Records">
          <div class="panel-heading">
            <div>
              <div class="eyebrow">Records</div>
              <h2 id="list-heading">People</h2>
            </div>
            <span id="result-count" class="muted">0 results</span>
          </div>
          <div id="record-list" class="record-list"></div>
        </section>

        <aside class="detail-panel" aria-label="Selected record">
          <div id="record-detail" class="empty-state">
            <p>Select a record to inspect fields, timeline, and relations.</p>
          </div>
        </aside>
      </main>
    </div>

    <dialog id="record-dialog">
      <form id="record-form" method="dialog" class="dialog-body">
        <div class="dialog-heading">
          <div>
            <div class="eyebrow">Create</div>
            <h2>New record</h2>
          </div>
          <button class="icon-button" value="cancel" aria-label="Close" type="submit">x</button>
        </div>
        <label>
          <span>Type</span>
          <select id="create-type" name="type">
            <option value="person">Person</option>
            <option value="company">Company</option>
            <option value="deal">Deal</option>
            <option value="collection">Platform item</option>
            <option value="task">Task</option>
            <option value="note">Note</option>
            <option value="activity">Activity</option>
          </select>
        </label>
        <div id="create-fields" class="form-grid"></div>
        <p id="form-error" class="form-error" hidden></p>
        <div class="dialog-actions">
          <button class="button" value="cancel" type="submit">Cancel</button>
          <button class="button primary" id="save-record" type="button">Create</button>
        </div>
      </form>
    </dialog>

    <script type="module" src="/assets/dashboard.js"></script>
  </body>
</html>`

const dashboardCss = `
:root {
  color-scheme: light;
  --bg: #f7f7f5;
  --panel: #ffffff;
  --ink: #171717;
  --muted: #6b7280;
  --line: #e5e7eb;
  --soft: #f3f4f6;
  --accent: #0f766e;
  --accent-ink: #ffffff;
  --warn: #92400e;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-width: 320px;
  background: var(--bg);
  color: var(--ink);
}

button, input, select, textarea {
  font: inherit;
}

.shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

.topbar {
  display: grid;
  grid-template-columns: minmax(160px, 260px) minmax(280px, 1fr) auto;
  gap: 18px;
  align-items: end;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
}

h1, h2, h3, p {
  margin: 0;
}

h1 {
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: 0;
}

h2 {
  font-size: 17px;
  line-height: 1.25;
  letter-spacing: 0;
}

h3 {
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0;
}

.eyebrow {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}

.search input,
select,
textarea,
.form-grid input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  padding: 8px 10px;
  outline: none;
}

.search input:focus,
select:focus,
textarea:focus,
.form-grid input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.button,
.icon-button {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
}

.button {
  min-height: 38px;
  padding: 8px 13px;
  font-weight: 650;
}

.icon-button {
  width: 32px;
  height: 32px;
}

.button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
}

.layout {
  display: grid;
  grid-template-columns: 190px minmax(320px, 1fr) minmax(340px, 430px);
  min-height: 0;
}

.sidebar,
.records-panel,
.detail-panel {
  min-height: 0;
  border-right: 1px solid var(--line);
  background: var(--panel);
}

.sidebar {
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 14px;
}

.nav-section {
  display: grid;
  gap: 4px;
}

.nav-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
  padding: 6px 10px 2px;
  text-transform: uppercase;
}

.nav-item {
  min-height: 36px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #374151;
  cursor: pointer;
  text-align: left;
  padding: 8px 10px;
}

.nav-item.active,
.nav-item:hover {
  background: var(--soft);
  color: var(--ink);
}

.records-panel {
  display: grid;
  grid-template-rows: auto 1fr;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--line);
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

.record-list {
  overflow: auto;
}

.platform-overview {
  display: grid;
  gap: 16px;
  padding: 16px;
  overflow: auto;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 11px;
}

.metric strong {
  display: block;
  font-size: 22px;
  line-height: 1.2;
}

.lane-grid {
  display: grid;
  gap: 12px;
}

.lane {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.lane-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: #fafafa;
}

.record-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  padding: 13px 16px;
  text-align: left;
}

.record-row:hover,
.record-row.active {
  background: #fafafa;
}

.record-main {
  min-width: 0;
}

.record-title {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-subtitle {
  margin-top: 3px;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: flex-end;
}

.badge {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: #374151;
  background: #fff;
  font-size: 11px;
  padding: 2px 7px;
}

.detail-panel {
  border-right: 0;
  overflow: auto;
}

.detail {
  display: grid;
  gap: 18px;
  padding: 18px;
}

.detail-header {
  display: grid;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.field-list,
.timeline-list,
.relation-list {
  display: grid;
  gap: 8px;
}

.field {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  font-size: 13px;
}

.field span:first-child {
  color: var(--muted);
}

.field span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.subsection {
  display: grid;
  gap: 10px;
}

.timeline-item,
.relation-item {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.empty-state {
  display: grid;
  min-height: 200px;
  place-items: center;
  padding: 24px;
  color: var(--muted);
  text-align: center;
}

dialog {
  width: min(520px, calc(100vw - 28px));
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
}

dialog::backdrop {
  background: rgba(17, 24, 39, 0.36);
}

.dialog-body {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.dialog-heading,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dialog-actions {
  justify-content: flex-end;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}

.form-grid {
  display: grid;
  gap: 12px;
}

textarea {
  min-height: 96px;
  resize: vertical;
}

.form-error {
  color: var(--warn);
  font-size: 13px;
}

@media (max-width: 920px) {
  .topbar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .layout {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: flex;
    overflow: auto;
    border-bottom: 1px solid var(--line);
  }

  .nav-section {
    display: flex;
    align-items: center;
  }

  .nav-label {
    padding: 0 6px;
  }

  .nav-item {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    border-top: 1px solid var(--line);
  }
}
`

const dashboardJs = `
const state = {
  view: "platform",
  type: "collection",
  kind: "",
  query: "",
  items: [],
  selected: null,
  platform: null,
}

const typeLabels = {
  all: "All records",
  platform: "Platform overview",
  collection: "Platform items",
  "platform.ticket": "Tickets",
  "platform.workflow": "Workflows",
  "platform.dependency": "Dependencies",
  "platform.qa": "QA",
  person: "People",
  company: "Companies",
  deal: "Deals",
  task: "Tasks",
  note: "Notes",
  activity: "Activities",
}

const fieldTemplates = {
  person: [
    ["name", "Name", "text", true],
    ["email", "Email", "email", false],
    ["title", "Title", "text", false],
    ["status", "Status", "select", false, ["", "lead", "active", "inactive", "do_not_contact"]],
  ],
  company: [
    ["name", "Name", "text", true],
    ["domain", "Domain", "text", false],
    ["industry", "Industry", "text", false],
    ["status", "Status", "select", false, ["", "prospect", "customer", "partner", "vendor", "inactive"]],
  ],
  deal: [
    ["name", "Name", "text", true],
    ["stage", "Stage", "text", false],
    ["status", "Status", "select", false, ["open", "won", "lost", "paused"]],
    ["value", "Value", "number", false],
    ["currency", "Currency", "text", false],
  ],
  collection: [
    ["title", "Title", "text", true],
    ["kind", "Platform area", "select", false, [
      "platform.ticket",
      "platform.workflow",
      "platform.dependency",
      "platform.qa",
    ]],
    ["status", "Status", "text", false],
    ["summary", "Summary", "textarea", false],
    ["tags", "Tags", "text", false],
  ],
  task: [
    ["title", "Title", "text", true],
    ["status", "Status", "select", false, ["todo", "doing", "done", "canceled"]],
    ["priority", "Priority", "select", false, ["normal", "low", "high", "urgent"]],
    ["dueAt", "Due", "datetime-local", false],
  ],
  note: [["body", "Body", "textarea", true]],
  activity: [
    ["kind", "Kind", "select", false, ["note", "email", "call", "meeting", "message", "task_completed", "custom"]],
    ["subject", "Subject", "text", false],
    ["body", "Body", "textarea", false],
    ["direction", "Direction", "select", false, ["", "inbound", "outbound", "internal"]],
  ],
}

const list = document.querySelector("#record-list")
const detail = document.querySelector("#record-detail")
const searchInput = document.querySelector("#search-input")
const count = document.querySelector("#result-count")
const heading = document.querySelector("#list-heading")
const dialog = document.querySelector("#record-dialog")
const createType = document.querySelector("#create-type")
const createFields = document.querySelector("#create-fields")
const formError = document.querySelector("#form-error")

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view ?? "records"
    state.type = button.dataset.type ?? "collection"
    state.kind = button.dataset.kind ?? ""
    state.selected = null
    syncActiveNav()
    loadRecords()
  })
})

searchInput.addEventListener("input", debounce(() => {
  state.query = searchInput.value
  loadRecords()
}, 180))

document.querySelector("#new-record").addEventListener("click", () => {
  formError.hidden = true
  createType.value = state.view === "platform" || state.type === "collection"
    ? "collection"
    : state.type === "all"
    ? "person"
    : state.type
  renderCreateFields()
  const kindInput = document.querySelector('[name="kind"]')
  if (kindInput && state.kind) kindInput.value = state.kind
  dialog.showModal()
})

createType.addEventListener("change", renderCreateFields)
document.querySelector("#save-record").addEventListener("click", createRecord)

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  })
  const body = await response.json()
  if (!body.ok) throw new Error(body.error?.message ?? "Request failed")
  return body
}

async function loadRecords() {
  if (state.view === "platform") {
    await loadPlatform()
    return
  }

  heading.textContent = state.kind ? typeLabels[state.kind] : typeLabels[state.type] ?? "Records"
  list.innerHTML = '<div class="empty-state"><p>Loading records...</p></div>'
  const params = new URLSearchParams()
  params.set("type", state.type)
  if (state.kind) params.set("kind", state.kind)
  if (state.query.trim()) params.set("q", state.query.trim())

  try {
    const body = await api("/api/workbench/records?" + params.toString())
    state.items = body.items
    renderRecords()
  } catch (error) {
    list.innerHTML = '<div class="empty-state"><p>' + escapeHtml(error.message) + '</p></div>'
  }
}

async function loadPlatform() {
  heading.textContent = "Platform overview"
  count.textContent = "Tickets, workflows, dependencies, QA"
  list.innerHTML = '<div class="empty-state"><p>Loading platform...</p></div>'
  detail.className = "empty-state"
  detail.innerHTML = "<p>Select a platform item to inspect fields, timeline, and relations.</p>"

  try {
    const body = await api("/api/workbench/platform")
    state.platform = body
    renderPlatform()
  } catch (error) {
    list.innerHTML = '<div class="empty-state"><p>' + escapeHtml(error.message) + '</p></div>'
  }
}

function renderPlatform() {
  const metrics = state.platform.metrics
  const metricItems = [
    ["Open tickets", metrics.openTickets],
    ["Active workflows", metrics.activeWorkflows],
    ["Unresolved dependencies", metrics.unresolvedDependencies],
    ["QA at risk", metrics.qaAtRisk],
    ["Open tasks", metrics.openTasks],
  ]

  list.innerHTML = '<div class="platform-overview">' +
    '<div class="metric-grid">' + metricItems.map(([label, value]) =>
      '<div class="metric"><strong>' + escapeHtml(value) + '</strong><span class="muted">' +
      escapeHtml(label) + '</span></div>').join("") + '</div>' +
    '<div class="lane-grid">' + state.platform.sections.map((section) => renderPlatformLane(section)).join("") +
    '</div></div>'

  list.querySelectorAll(".record-row").forEach((row) => {
    row.addEventListener("click", () => selectRecord({ type: row.dataset.type, id: row.dataset.id }))
  })
}

function renderPlatformLane(section) {
  const rows = section.items.length
    ? section.items.map(renderRecordRow).join("")
    : '<div class="empty-state"><p>No ' + escapeHtml(section.label.toLowerCase()) + ' yet.</p></div>'
  return '<section class="lane"><div class="lane-heading"><h3>' + escapeHtml(section.label) +
    '</h3><span class="muted">' + section.items.length + '</span></div>' + rows + '</section>'
}

function renderRecords() {
  count.textContent = state.items.length + (state.items.length === 1 ? " result" : " results")
  if (!state.items.length) {
    list.innerHTML = '<div class="empty-state"><p>No records yet. Create one to start.</p></div>'
    detail.className = "empty-state"
    detail.innerHTML = "<p>Select a record to inspect fields, timeline, and relations.</p>"
    return
  }

  list.innerHTML = state.items.map(renderRecordRow).join("")

  list.querySelectorAll(".record-row").forEach((row) => {
    row.addEventListener("click", () => selectRecord({ type: row.dataset.type, id: row.dataset.id }))
  })
}

function renderRecordRow(item) {
  const active = state.selected && state.selected.id === item.ref.id && state.selected.type === item.ref.type
  return '<button class="record-row ' + (active ? "active" : "") + '" data-type="' + item.ref.type + '" data-id="' +
    item.ref.id + '">' +
    '<span class="record-main"><span class="eyebrow">' + escapeHtml(item.eyebrow) + '</span>' +
    '<span class="record-title">' + escapeHtml(item.title) + '</span>' +
    '<span class="record-subtitle">' + escapeHtml(item.subtitle ?? "Updated " + formatDate(item.updatedAt)) +
    '</span></span>' +
    '<span class="badge-row">' + item.badges.map((badge) => '<span class="badge">' + escapeHtml(badge) +
      '</span>').join("") + '</span>' +
    '</button>'
}

async function selectRecord(ref) {
  state.selected = ref
  if (state.view === "platform") {
    renderPlatform()
  } else {
    renderRecords()
  }
  detail.className = "empty-state"
  detail.innerHTML = "<p>Loading detail...</p>"
  try {
    const body = await api("/api/workbench/records/" + encodeURIComponent(ref.type) + "/" + encodeURIComponent(ref.id))
    renderDetail(body.detail)
  } catch (error) {
    detail.innerHTML = '<p>' + escapeHtml(error.message) + '</p>'
  }
}

function renderDetail(item) {
  detail.className = "detail"
  detail.innerHTML = [
    '<div class="detail-header">',
    '<div class="eyebrow">' + escapeHtml(item.eyebrow) + '</div>',
    '<h2>' + escapeHtml(item.title) + '</h2>',
    '<p class="muted">' + escapeHtml(item.subtitle ?? "Updated " + formatDate(item.updatedAt)) + '</p>',
    '<div class="badge-row" style="justify-content:flex-start">' + item.badges.map((badge) =>
      '<span class="badge">' + escapeHtml(badge) + '</span>').join("") + '</div>',
    '<button class="button" id="archive-record" type="button">Archive</button>',
    '</div>',
    section("Fields", '<div class="field-list">' + item.fields.map((field) =>
      '<div class="field"><span>' + escapeHtml(field.label) + '</span><span>' + escapeHtml(field.value) +
      '</span></div>').join("") + '</div>'),
    section("Timeline", item.timeline.length ? '<div class="timeline-list">' + item.timeline.map((entry) =>
      '<div class="timeline-item"><div class="eyebrow">' + escapeHtml(entry.kind) + '</div><h3>' +
      escapeHtml(entry.title) + '</h3><p class="muted">' +
      escapeHtml(entry.subtitle ?? formatDate(entry.occurredAt)) + '</p></div>').join("") + '</div>' :
      '<p class="muted">No timeline records yet.</p>'),
    section("Relations", item.relations.length ? '<div class="relation-list">' + item.relations.map((relation) =>
      '<div class="relation-item"><h3>' + escapeHtml(relation.kind) + '</h3><p class="muted">' +
      escapeHtml(relation.from.type + ":" + relation.from.id + " -> " + relation.to.type + ":" + relation.to.id) +
      '</p></div>').join("") + '</div>' : '<p class="muted">No relations yet.</p>'),
  ].join("")

  document.querySelector("#archive-record").addEventListener("click", archiveSelected)
}

function section(title, body) {
  return '<section class="subsection"><h3>' + escapeHtml(title) + '</h3>' + body + '</section>'
}

function renderCreateFields() {
  const template = fieldTemplates[createType.value] ?? fieldTemplates.person
  createFields.innerHTML = template.map(([name, label, kind, required, options]) => {
    if (kind === "textarea") {
      return '<label><span>' + label + '</span><textarea name="' + name + '" ' + (required ? "required" : "") +
        '></textarea></label>'
    }
    if (kind === "select") {
      return '<label><span>' + label + '</span><select name="' + name + '">' +
        options.map((option) => '<option value="' + option + '">' + (option || "None") + '</option>').join("") +
        '</select></label>'
    }
    return '<label><span>' + label + '</span><input name="' + name + '" type="' + kind + '" ' +
      (required ? "required" : "") + '></label>'
  }).join("")
}

async function createRecord() {
  const data = Object.fromEntries(new FormData(document.querySelector("#record-form")).entries())
  const type = data.type
  delete data.type

  try {
    formError.hidden = true
    await api("/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        type,
        data,
        idempotencyKey: "dashboard:create:" + type + ":" + crypto.randomUUID(),
      }),
    })
    dialog.close()
    state.view = "records"
    state.type = type
    state.kind = type === "collection" ? data.kind ?? "" : ""
    searchInput.value = ""
    state.query = ""
    syncActiveNav()
    await loadRecords()
  } catch (error) {
    formError.textContent = error.message
    formError.hidden = false
  }
}

async function archiveSelected() {
  if (!state.selected) return
  await api("/api/workbench/records/" + encodeURIComponent(state.selected.type) + "/" +
    encodeURIComponent(state.selected.id) + "/archive", { method: "POST", body: "{}" })
  state.selected = null
  await loadRecords()
}

function syncActiveNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    const itemView = item.dataset.view ?? "records"
    const itemType = item.dataset.type ?? "collection"
    const itemKind = item.dataset.kind ?? ""
    item.classList.toggle(
      "active",
      itemView === state.view && itemType === state.type && itemKind === state.kind,
    )
  })
}

function debounce(fn, wait) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : ""
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

renderCreateFields()
syncActiveNav()
loadRecords()
`

if (import.meta.main) {
  const dbPath = Deno.env.get("BARE_CRM_DB") ?? "./bare-crm.db"
  const port = Number(Deno.env.get("BARE_CRM_DASHBOARD_PORT") ?? "8787")
  const server = startDashboardServer({ dbPath, port })
  console.log(`Bare CRM dashboard: http://127.0.0.1:${server.addr.port}`)
  await server.finished
}
