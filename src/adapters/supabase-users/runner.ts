import manifestJson from "./plugin.json" with { type: "json" }
import { validatePluginManifest } from "../../index.ts"
import type {
  ExtensionHost,
  ExtensionPluginState,
  ExternalRef,
  Person,
  PluginManifest,
  PluginRuntimeCapability,
} from "../../index.ts"

export const BARE_SUPABASE_USERS_PLUGIN_ID = "bare.supabase-users"

export const BARE_SUPABASE_USERS_REQUIRED_CAPABILITIES: PluginRuntimeCapability[] = [
  "plugin:commands",
  "network:external",
  "secrets:read",
  "crm:read:record.search",
  "crm:write:person.create",
  "crm:write:record.update",
]

export const bareSupabaseUsersPluginManifest: PluginManifest = validatePluginManifest(manifestJson)

export type AppUserTraits = Record<string, string | number | boolean | null>

export type AppUserMatch = {
  system: string
  userId: string
  email: string
  name?: string
  url?: string
  traits?: AppUserTraits
}

export type AppUserDirectory = {
  findByEmail(input: { workspaceId: string; email: string }): Promise<AppUserMatch | null>
  findByUserId?(input: { workspaceId: string; userId: string }): Promise<AppUserMatch | null>
}

export type SupabaseAppUserTableConfig = {
  url?: string
  serviceRoleKey?: string
  table?: string
  schema?: string
  idColumn?: string
  emailColumn?: string
  nameColumn?: string
  system?: string
  adminUrlTemplate?: string
  traitColumns?: Record<string, string>
}

export type SupabaseAppUserDirectoryOptions = {
  config?: SupabaseAppUserTableConfig
  fetch?: typeof fetch
}

export type BareSupabaseUsersInstallInput = {
  workspaceId: string
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type BareSupabaseUsersRunnerOptions = {
  host: ExtensionHost
  workspaceId: string
  pluginId?: string
  directory?: AppUserDirectory
  config?: SupabaseAppUserTableConfig
  fetch?: typeof fetch
}

export type BareSupabaseUsersLinkPersonInput = {
  email: string
}

export type BareSupabaseUsersLinkPersonResult =
  | { status: "not_found"; match: null; person?: undefined }
  | { status: "created" | "matched" | "updated"; match: AppUserMatch; person: Person }

export type BareSupabaseUsersRunner = {
  findByEmail(input: { email: string }): Promise<AppUserMatch | null>
  linkPersonByEmail(
    input: BareSupabaseUsersLinkPersonInput,
  ): Promise<BareSupabaseUsersLinkPersonResult>
}

export class BareSupabaseUsersPluginError extends Error {
  constructor(
    readonly code:
      | "supabase_users.capability_not_approved"
      | "supabase_users.lookup_failed"
      | "supabase_users.missing_secret"
      | "supabase_users.person_ambiguous"
      | "supabase_users.user_ambiguous",
    message: string,
  ) {
    super(message)
    this.name = "BareSupabaseUsersPluginError"
  }
}

export function installBareSupabaseUsersPlugin(
  host: ExtensionHost,
  input: BareSupabaseUsersInstallInput,
): ExtensionPluginState {
  return host.installPlugin({
    workspaceId: input.workspaceId,
    manifest: bareSupabaseUsersPluginManifest,
    approvedCapabilities: input.approvedCapabilities ?? BARE_SUPABASE_USERS_REQUIRED_CAPABILITIES,
    enabled: input.enabled ?? true,
  })
}

export function createSupabaseUsersPluginRunner(
  options: BareSupabaseUsersRunnerOptions,
): BareSupabaseUsersRunner {
  return {
    findByEmail(input) {
      return findAppUserByEmail({ ...options, email: input.email })
    },
    linkPersonByEmail(input) {
      return linkAppUserPersonByEmail({ ...options, email: input.email })
    },
  }
}

export async function findAppUserByEmail(
  input: BareSupabaseUsersRunnerOptions & { email: string },
): Promise<AppUserMatch | null> {
  const pluginId = input.pluginId ?? BARE_SUPABASE_USERS_PLUGIN_ID
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "network:external")

  const directory = input.directory ?? await createDirectoryFromHost(input, pluginId)
  return await directory.findByEmail({
    workspaceId: input.workspaceId,
    email: normalizeEmail(input.email),
  })
}

export async function linkAppUserPersonByEmail(
  input: BareSupabaseUsersRunnerOptions & BareSupabaseUsersLinkPersonInput,
): Promise<BareSupabaseUsersLinkPersonResult> {
  const pluginId = input.pluginId ?? BARE_SUPABASE_USERS_PLUGIN_ID
  const match = await findAppUserByEmail(input)
  if (!match) return { status: "not_found", match: null }

  const existingByRef = await findPersonByExternalRef(input, pluginId, appUserExternalRef(match))
  if (existingByRef) {
    const updated = await updatePersonIfNeeded(input, pluginId, existingByRef, match)
    return {
      status: updated === existingByRef ? "matched" : "updated",
      match,
      person: updated,
    }
  }

  const existingByEmail = await findPersonByEmail(input, pluginId, match.email)
  if (existingByEmail) {
    return {
      status: "updated",
      match,
      person: await updatePersonIfNeeded(input, pluginId, existingByEmail, match),
    }
  }

  const person = await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "person.create",
    input: {
      workspaceId: input.workspaceId,
      name: match.name ?? match.email,
      emails: [{ value: match.email, primary: true }],
      source: "plugin",
      externalRefs: [appUserExternalRef(match)],
      custom: customWithAppUser(undefined, match),
    },
    idempotencyKey: `supabase-users:person:${match.system}:${match.userId}`,
  }) as Person

  return { status: "created", match, person }
}

export function createSupabaseAppUserDirectory(
  options: SupabaseAppUserDirectoryOptions,
): AppUserDirectory {
  const fetchImpl = options.fetch ?? fetch

  return {
    async findByEmail(input) {
      const config = normalizedSupabaseConfig(options.config, input.workspaceId)
      const url = supabaseRestUrl(config, input.email)
      const response = await fetchImpl(url, {
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
          accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new BareSupabaseUsersPluginError(
          "supabase_users.lookup_failed",
          `Supabase user lookup failed with status ${response.status}`,
        )
      }

      const rows = await response.json()
      if (!Array.isArray(rows)) {
        throw new BareSupabaseUsersPluginError(
          "supabase_users.lookup_failed",
          "Supabase user lookup returned a non-array response",
        )
      }
      if (rows.length > 1) {
        throw new BareSupabaseUsersPluginError(
          "supabase_users.user_ambiguous",
          `Supabase user lookup matched multiple users for ${input.email}`,
        )
      }

      const row = rows[0]
      if (!isRecord(row)) return null

      return rowToAppUserMatch(config, input.workspaceId, row)
    },
  }
}

async function createDirectoryFromHost(
  input: BareSupabaseUsersRunnerOptions,
  pluginId: string,
): Promise<AppUserDirectory> {
  assertApprovedRuntimeCapability(input.host, input.workspaceId, pluginId, "secrets:read")
  const url = input.config?.url ?? await requiredSecret(input.host, input.workspaceId, pluginId, {
    key: "supabase_url",
    label: "Supabase URL",
  })
  const serviceRoleKey = input.config?.serviceRoleKey ??
    await requiredSecret(input.host, input.workspaceId, pluginId, {
      key: "supabase_service_role_key",
      label: "Supabase service role key",
    })

  return createSupabaseAppUserDirectory({
    config: { ...input.config, url, serviceRoleKey },
    fetch: input.fetch,
  })
}

async function requiredSecret(
  host: ExtensionHost,
  workspaceId: string,
  pluginId: string,
  input: { key: string; label: string },
): Promise<string> {
  const value = await host.getPluginSecret({ workspaceId, pluginId, key: input.key })
  if (!value) {
    throw new BareSupabaseUsersPluginError(
      "supabase_users.missing_secret",
      `${input.label} secret is required: ${input.key}`,
    )
  }
  return value
}

async function findPersonByExternalRef(
  input: BareSupabaseUsersRunnerOptions,
  pluginId: string,
  externalRef: ExternalRef,
): Promise<Person | null> {
  const matches = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.search",
    input: {
      workspaceId: input.workspaceId,
      type: "person",
      externalRef,
      limit: 2,
    },
  })

  if (matches.length > 1) {
    throw new BareSupabaseUsersPluginError(
      "supabase_users.person_ambiguous",
      `App user external reference matched multiple people: ${externalRef.system}:${externalRef.id}`,
    )
  }

  return (matches[0] ?? null) as Person | null
}

async function findPersonByEmail(
  input: BareSupabaseUsersRunnerOptions,
  pluginId: string,
  email: string,
): Promise<Person | null> {
  const normalized = normalizeEmail(email)
  const matches = await input.host.readAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.search",
    input: {
      workspaceId: input.workspaceId,
      type: "person",
      text: normalized,
      limit: 10,
    },
  })
  const exact = matches.filter((record): record is Person =>
    record.type === "person" &&
    Boolean(record.emails?.some((candidate) => normalizeEmail(candidate.value) === normalized))
  )

  if (exact.length > 1) {
    throw new BareSupabaseUsersPluginError(
      "supabase_users.person_ambiguous",
      `Email matched multiple people: ${email}`,
    )
  }

  return exact[0] ?? null
}

async function updatePersonIfNeeded(
  input: BareSupabaseUsersRunnerOptions,
  pluginId: string,
  person: Person,
  match: AppUserMatch,
): Promise<Person> {
  const externalRefs = mergeExternalRefs(person.externalRefs, [appUserExternalRef(match)])
  const emails = personHasEmail(person, match.email)
    ? person.emails
    : [...(person.emails ?? []), { value: match.email, primary: !person.emails?.length }]
  const custom = customWithAppUser(person.custom, match)

  if (
    sameJson(externalRefs, person.externalRefs ?? []) &&
    sameJson(emails ?? [], person.emails ?? []) &&
    sameJson(custom, person.custom ?? {})
  ) {
    return person
  }

  return await input.host.writeAsPlugin({
    workspaceId: input.workspaceId,
    pluginId,
    name: "record.update",
    input: {
      workspaceId: input.workspaceId,
      ref: { type: "person", id: person.id },
      patch: { externalRefs, emails, custom },
    },
    idempotencyKey: `supabase-users:link-person:${match.system}:${match.userId}:${person.id}`,
  }) as Person
}

function appUserExternalRef(match: AppUserMatch): ExternalRef {
  return {
    system: match.system,
    id: match.userId,
    url: match.url,
    kind: "canonical",
  }
}

function customWithAppUser(
  current: Record<string, unknown> | undefined,
  match: AppUserMatch,
): Record<string, unknown> {
  const appUsers = isRecord(current?.appUsers) ? current.appUsers : {}
  return {
    ...(current ?? {}),
    appUsers: {
      ...appUsers,
      [match.system]: {
        userId: match.userId,
        email: match.email,
        name: match.name,
        url: match.url,
        traits: match.traits,
      },
    },
  }
}

function normalizedSupabaseConfig(
  config: SupabaseAppUserTableConfig | undefined,
  workspaceId: string,
):
  & Required<
    Pick<
      SupabaseAppUserTableConfig,
      "emailColumn" | "idColumn" | "serviceRoleKey" | "system" | "table" | "url"
    >
  >
  & SupabaseAppUserTableConfig {
  const url = config?.url
  const serviceRoleKey = config?.serviceRoleKey
  if (!url) {
    throw new BareSupabaseUsersPluginError(
      "supabase_users.missing_secret",
      "Supabase URL is required",
    )
  }
  if (!serviceRoleKey) {
    throw new BareSupabaseUsersPluginError(
      "supabase_users.missing_secret",
      "Supabase service role key is required",
    )
  }

  return {
    ...config,
    url,
    serviceRoleKey,
    table: config?.table ?? "profiles",
    idColumn: config?.idColumn ?? "id",
    emailColumn: config?.emailColumn ?? "email",
    system: config?.system ?? `app:${workspaceId}`,
  }
}

function supabaseRestUrl(
  config: ReturnType<typeof normalizedSupabaseConfig>,
  email: string,
): string {
  const base = config.url.replace(/\/$/, "")
  const table = encodeURIComponent(config.table)
  const columns = selectColumns(config)
  const url = new URL(`${base}/rest/v1/${table}`)
  url.searchParams.set("select", columns.join(","))
  url.searchParams.set(config.emailColumn, `eq.${normalizeEmail(email)}`)
  url.searchParams.set("limit", "2")
  if (config.schema) url.searchParams.set("schema", config.schema)
  return url.toString()
}

function selectColumns(config: SupabaseAppUserTableConfig): string[] {
  return unique([
    config.idColumn ?? "id",
    config.emailColumn ?? "email",
    config.nameColumn,
    ...Object.values(config.traitColumns ?? {}),
  ].filter((column): column is string => Boolean(column)))
}

function rowToAppUserMatch(
  config: ReturnType<typeof normalizedSupabaseConfig>,
  workspaceId: string,
  row: Record<string, unknown>,
): AppUserMatch | null {
  const userId = stringValue(row[config.idColumn])
  const email = stringValue(row[config.emailColumn])
  if (!userId || !email) return null

  const traits: AppUserTraits = {}
  for (const [trait, column] of Object.entries(config.traitColumns ?? {})) {
    const value = row[column]
    if (isTraitValue(value)) traits[trait] = value
  }

  return {
    system: config.system ?? `app:${workspaceId}`,
    userId,
    email: normalizeEmail(email),
    name: config.nameColumn ? stringValue(row[config.nameColumn]) : undefined,
    url: config.adminUrlTemplate?.replaceAll("{id}", encodeURIComponent(userId)),
    traits: Object.keys(traits).length ? traits : undefined,
  }
}

function assertApprovedRuntimeCapability(
  host: ExtensionHost,
  workspaceId: string,
  pluginId: string,
  capability: PluginRuntimeCapability,
): void {
  const state = host.getPluginState({ workspaceId, pluginId })
  if (
    !state?.enabled ||
    !state.approvedCapabilities.includes(capability)
  ) {
    throw new BareSupabaseUsersPluginError(
      "supabase_users.capability_not_approved",
      `Plugin capability is not approved: ${capability}`,
    )
  }
}

function mergeExternalRefs(
  current: ExternalRef[] | undefined,
  incoming: ExternalRef[],
): ExternalRef[] {
  const refs = [...(current ?? [])]
  for (const ref of incoming) {
    if (!refs.some((candidate) => candidate.system === ref.system && candidate.id === ref.id)) {
      refs.push(ref)
    }
  }
  return refs
}

function personHasEmail(person: Person, email: string): boolean {
  const normalized = normalizeEmail(email)
  return Boolean(person.emails?.some((candidate) => normalizeEmail(candidate.value) === normalized))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined
}

function isTraitValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean"
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
