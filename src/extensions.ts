import type {
  AnyRecord,
  Capability,
  Collection,
  CrmEvent,
  CrmEventName,
  CrmKernel,
  EntityRef,
  EntityType,
  ExecutionContext,
  ReadInputByName,
  ReadName,
  ReadResultByName,
  WriteInputByName,
  WriteName,
  WriteResultByName,
} from "./types.ts"
import type {
  PluginCollectionProfileContribution,
  PluginManifest,
  PluginRuntimeCapability,
} from "./plugins.ts"
import { validatePluginManifest } from "./plugins.ts"

export type ExtensionHostOptions = {
  crm: CrmKernel
  secrets?: SecretStore
  now?: () => Date
}

export type ExtensionInstallInput = {
  workspaceId: string
  manifest: unknown
  approvedCapabilities?: PluginRuntimeCapability[]
  enabled?: boolean
}

export type ExtensionPluginState = {
  workspaceId: string
  pluginId: string
  manifest: PluginManifest
  approvedCapabilities: PluginRuntimeCapability[]
  enabled: boolean
  installedAt: string
  updatedAt: string
}

export type CollectionProfileValidationIssue = {
  code:
    | "collection.profile_unknown"
    | "collection.status_invalid"
    | "collection.outcome_invalid"
    | "collection.related_required"
    | "collection.related_invalid"
  message: string
  field?: string
  severity: "block"
}

export type CollectionProfileValidationResult =
  | { ok: true; profile: PluginCollectionProfileContribution }
  | { ok: false; issues: CollectionProfileValidationIssue[] }

export type ExtensionEventCursor = {
  workspaceId: string
  pluginId: string
  subscriptionId: string
  listensTo: CrmEventName[]
  lastEventId?: string
  updatedAt: string
}

export type SecretRef = {
  workspaceId: string
  pluginId: string
  key: string
}

export type SecretStore = {
  get(ref: SecretRef): Promise<string | null>
  set(ref: SecretRef & { value: string }): Promise<void>
  delete(ref: SecretRef): Promise<void>
}

export type ExtensionHost = {
  installPlugin(input: ExtensionInstallInput): ExtensionPluginState
  uninstallPlugin(input: { workspaceId: string; pluginId: string }): void
  approveCapabilities(input: {
    workspaceId: string
    pluginId: string
    capabilities: PluginRuntimeCapability[]
  }): ExtensionPluginState
  enablePlugin(input: { workspaceId: string; pluginId: string }): ExtensionPluginState
  disablePlugin(input: { workspaceId: string; pluginId: string }): ExtensionPluginState
  getPluginState(input: { workspaceId: string; pluginId: string }): ExtensionPluginState | null
  listPluginStates(input: { workspaceId: string }): ExtensionPluginState[]
  listCollectionProfiles(input: { workspaceId: string }): PluginCollectionProfileContribution[]
  validateCollection(input: {
    workspaceId: string
    collection: Pick<Collection, "kind" | "status" | "related" | "outcome">
  }): CollectionProfileValidationResult
  writeAsPlugin<W extends WriteName>(
    input: {
      workspaceId: string
      pluginId: string
      name: W
      input: WriteInputByName[W]
      idempotencyKey?: string
    },
  ): Promise<WriteResultByName[W]>
  readAsPlugin<R extends ReadName>(
    input: {
      workspaceId: string
      pluginId: string
      name: R
      input: ReadInputByName[R]
    },
  ): Promise<ReadResultByName[R]>
  listPendingEvents(input: {
    workspaceId: string
    pluginId: string
    subscriptionId: string
    limit?: number
  }): Promise<CrmEvent[]>
  ackEvent(input: {
    workspaceId: string
    pluginId: string
    subscriptionId: string
    eventId: string
  }): void
  getEventCursor(input: {
    workspaceId: string
    pluginId: string
    subscriptionId: string
  }): ExtensionEventCursor | null
  setPluginSecret(input: SecretRef & { value: string }): Promise<void>
  getPluginSecret(input: SecretRef): Promise<string | null>
  deletePluginSecret(input: SecretRef): Promise<void>
}

export class ExtensionHostError extends Error {
  constructor(
    readonly code:
      | "extension.plugin_not_installed"
      | "extension.plugin_disabled"
      | "extension.capability_not_declared"
      | "extension.capability_not_approved"
      | "extension.collection_profile_invalid"
      | "extension.subscription_not_found",
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = "ExtensionHostError"
  }
}

export function createMemorySecretStore(): SecretStore {
  const values = new Map<string, string>()

  return {
    async get(ref) {
      return values.get(secretKey(ref)) ?? null
    },
    async set(ref) {
      values.set(secretKey(ref), ref.value)
    },
    async delete(ref) {
      values.delete(secretKey(ref))
    },
  }
}

export function createExtensionHost(options: ExtensionHostOptions): ExtensionHost {
  const eventScanLimit = 100_000
  const now = options.now ?? (() => new Date())
  const secrets = options.secrets ?? createMemorySecretStore()
  const plugins = new Map<string, ExtensionPluginState>()
  const cursors = new Map<string, ExtensionEventCursor>()

  function installPlugin(input: ExtensionInstallInput): ExtensionPluginState {
    const manifest = validatePluginManifest(input.manifest)
    const approvedCapabilities = input.approvedCapabilities ?? []
    assertApprovedCapabilitiesDeclared(manifest, approvedCapabilities)

    const timestamp = now().toISOString()
    const state: ExtensionPluginState = {
      workspaceId: input.workspaceId,
      pluginId: manifest.id,
      manifest,
      approvedCapabilities,
      enabled: input.enabled ?? false,
      installedAt: timestamp,
      updatedAt: timestamp,
    }

    plugins.set(pluginKey(input.workspaceId, manifest.id), state)
    registerWorkflowSubscriptions(state, cursors, timestamp)
    return clonePluginState(state)
  }

  function getInstalled(workspaceId: string, pluginId: string): ExtensionPluginState {
    const state = plugins.get(pluginKey(workspaceId, pluginId))
    if (!state) {
      throw new ExtensionHostError(
        "extension.plugin_not_installed",
        `Plugin is not installed in workspace: ${pluginId}`,
        "pluginId",
      )
    }
    return state
  }

  function getEnabled(workspaceId: string, pluginId: string): ExtensionPluginState {
    const state = getInstalled(workspaceId, pluginId)
    if (!state.enabled) {
      throw new ExtensionHostError(
        "extension.plugin_disabled",
        `Plugin is disabled in workspace: ${pluginId}`,
        "pluginId",
      )
    }
    return state
  }

  return {
    installPlugin,

    uninstallPlugin(input) {
      plugins.delete(pluginKey(input.workspaceId, input.pluginId))
      for (const key of cursors.keys()) {
        if (key.startsWith(`${input.workspaceId}:${input.pluginId}:`)) cursors.delete(key)
      }
    },

    approveCapabilities(input) {
      const state = getInstalled(input.workspaceId, input.pluginId)
      assertApprovedCapabilitiesDeclared(state.manifest, input.capabilities)
      state.approvedCapabilities = [
        ...new Set([...state.approvedCapabilities, ...input.capabilities]),
      ]
      state.updatedAt = now().toISOString()
      registerWorkflowSubscriptions(state, cursors, state.updatedAt)
      return clonePluginState(state)
    },

    enablePlugin(input) {
      const state = getInstalled(input.workspaceId, input.pluginId)
      state.enabled = true
      state.updatedAt = now().toISOString()
      return clonePluginState(state)
    },

    disablePlugin(input) {
      const state = getInstalled(input.workspaceId, input.pluginId)
      state.enabled = false
      state.updatedAt = now().toISOString()
      return clonePluginState(state)
    },

    getPluginState(input) {
      const state = plugins.get(pluginKey(input.workspaceId, input.pluginId))
      return state ? clonePluginState(state) : null
    },

    listPluginStates(input) {
      return [...plugins.values()]
        .filter((state) => state.workspaceId === input.workspaceId)
        .map(clonePluginState)
    },

    listCollectionProfiles(input) {
      return [...plugins.values()]
        .filter((state) =>
          state.workspaceId === input.workspaceId &&
          state.enabled &&
          state.approvedCapabilities.includes("plugin:profiles")
        )
        .flatMap((state) => state.manifest.contributes.collectionProfiles ?? [])
        .map((profile) => ({ ...profile }))
    },

    validateCollection(input) {
      const profile = this.listCollectionProfiles({ workspaceId: input.workspaceId })
        .find((candidate) => candidate.id === input.collection.kind)
      if (!profile) {
        return {
          ok: false,
          issues: [{
            code: "collection.profile_unknown",
            message: `Unknown collection profile: ${input.collection.kind}`,
            field: "kind",
            severity: "block",
          }],
        }
      }

      const issues = validateCollectionAgainstProfile(input.collection, profile)
      return issues.length > 0 ? { ok: false, issues } : { ok: true, profile: { ...profile } }
    },

    async writeAsPlugin(input) {
      const state = getEnabled(input.workspaceId, input.pluginId)
      assertApprovedCapability(state, requiredCapability("write", input.name))

      if (input.name === "collection.create") {
        const result = this.validateCollection({
          workspaceId: input.workspaceId,
          collection: input.input as WriteInputByName["collection.create"],
        })
        if (!result.ok) {
          throw new ExtensionHostError(
            "extension.collection_profile_invalid",
            result.issues.map((issue) => issue.message).join("; "),
            result.issues[0]?.field,
          )
        }
      }

      return await options.crm.write(
        input.name,
        input.input,
        {
          context: pluginContext(state),
          idempotencyKey: input.idempotencyKey,
        },
      ) as WriteResultByName[typeof input.name]
    },

    async readAsPlugin(input) {
      const state = getEnabled(input.workspaceId, input.pluginId)
      assertApprovedCapability(state, requiredCapability("read", input.name))

      return await options.crm.read(
        input.name,
        input.input,
        { context: pluginContext(state) },
      ) as ReadResultByName[typeof input.name]
    },

    async listPendingEvents(input) {
      const state = getEnabled(input.workspaceId, input.pluginId)
      assertApprovedCapability(state, "plugin:workflows")
      assertApprovedCapability(state, "crm:read:event.list")
      const cursor = getCursor(cursors, input)
      const events = await options.crm.read("event.list", {
        workspaceId: input.workspaceId,
        limit: eventScanLimit,
      }, { context: pluginContext(state) })
      const start = cursor.lastEventId
        ? events.findIndex((event) => event.id === cursor.lastEventId) + 1
        : 0
      const afterCursor = start > 0 ? events.slice(start) : events
      return afterCursor
        .filter((event) => cursor.listensTo.includes(event.name))
        .slice(0, input.limit ?? 100)
    },

    ackEvent(input) {
      const cursor = getCursor(cursors, input)
      cursor.lastEventId = input.eventId
      cursor.updatedAt = now().toISOString()
    },

    getEventCursor(input) {
      const cursor = cursors.get(cursorKey(input))
      return cursor ? cloneCursor(cursor) : null
    },

    async setPluginSecret(input) {
      getInstalled(input.workspaceId, input.pluginId)
      await secrets.set(input)
    },

    async getPluginSecret(input) {
      const state = getEnabled(input.workspaceId, input.pluginId)
      assertApprovedCapability(state, "secrets:read")
      return await secrets.get(input)
    },

    async deletePluginSecret(input) {
      getInstalled(input.workspaceId, input.pluginId)
      await secrets.delete(input)
    },
  }
}

function assertApprovedCapabilitiesDeclared(
  manifest: PluginManifest,
  approvedCapabilities: PluginRuntimeCapability[],
): void {
  const declared = new Set(manifest.capabilities)
  for (const capability of approvedCapabilities) {
    if (!declared.has(capability)) {
      throw new ExtensionHostError(
        "extension.capability_not_declared",
        `Approved capability was not declared by plugin: ${capability}`,
        "approvedCapabilities",
      )
    }
  }
}

function assertApprovedCapability(
  state: ExtensionPluginState,
  required: PluginRuntimeCapability | Capability,
): void {
  const approved = state.approvedCapabilities
  if (
    approved.includes("crm:*") ||
    approved.includes(required as PluginRuntimeCapability) ||
    (typeof required === "string" && required.startsWith("crm:read:") &&
      approved.includes("crm:read")) ||
    (typeof required === "string" && required.startsWith("crm:write:") &&
      approved.includes("crm:write"))
  ) {
    return
  }

  throw new ExtensionHostError(
    "extension.capability_not_approved",
    `Plugin capability is not approved: ${required}`,
    "capabilities",
  )
}

function validateCollectionAgainstProfile(
  collection: Pick<Collection, "kind" | "status" | "related" | "outcome">,
  profile: PluginCollectionProfileContribution,
): CollectionProfileValidationIssue[] {
  const issues: CollectionProfileValidationIssue[] = []

  if (
    collection.status &&
    profile.allowedStatuses?.length &&
    !profile.allowedStatuses.includes(collection.status)
  ) {
    issues.push({
      code: "collection.status_invalid",
      message: `Collection status is not allowed for ${profile.id}: ${collection.status}`,
      field: "status",
      severity: "block",
    })
  }

  if (
    collection.outcome?.code &&
    profile.allowedOutcomes?.length &&
    !profile.allowedOutcomes.includes(collection.outcome.code)
  ) {
    issues.push({
      code: "collection.outcome_invalid",
      message: `Collection outcome is not allowed for ${profile.id}: ${collection.outcome.code}`,
      field: "outcome.code",
      severity: "block",
    })
  }

  const relatedTypes = new Set((collection.related ?? []).map((ref) => ref.type))
  for (const required of profile.requiredRelated ?? []) {
    if (!relatedTypes.has(required)) {
      issues.push({
        code: "collection.related_required",
        message: `Collection profile ${profile.id} requires related ${required}`,
        field: "related",
        severity: "block",
      })
    }
  }

  const allowedRelated = new Set([
    ...(profile.requiredRelated ?? []),
    ...(profile.optionalRelated ?? []),
  ])
  if (allowedRelated.size > 0) {
    for (const ref of collection.related ?? []) {
      if (!allowedRelated.has(ref.type)) {
        issues.push({
          code: "collection.related_invalid",
          message: `Collection profile ${profile.id} does not allow related ${ref.type}`,
          field: "related",
          severity: "block",
        })
      }
    }
  }

  return issues
}

function registerWorkflowSubscriptions(
  state: ExtensionPluginState,
  cursors: Map<string, ExtensionEventCursor>,
  timestamp: string,
): void {
  if (!state.approvedCapabilities.includes("plugin:workflows")) return

  for (const workflow of state.manifest.contributes.workflows ?? []) {
    const key = cursorKey({
      workspaceId: state.workspaceId,
      pluginId: state.pluginId,
      subscriptionId: workflow.id,
    })
    if (cursors.has(key)) continue
    cursors.set(key, {
      workspaceId: state.workspaceId,
      pluginId: state.pluginId,
      subscriptionId: workflow.id,
      listensTo: workflow.listensTo as CrmEventName[],
      updatedAt: timestamp,
    })
  }
}

function getCursor(
  cursors: Map<string, ExtensionEventCursor>,
  input: { workspaceId: string; pluginId: string; subscriptionId: string },
): ExtensionEventCursor {
  const cursor = cursors.get(cursorKey(input))
  if (!cursor) {
    throw new ExtensionHostError(
      "extension.subscription_not_found",
      `Event subscription is not registered: ${input.subscriptionId}`,
      "subscriptionId",
    )
  }
  return cursor
}

function pluginContext(state: ExtensionPluginState): ExecutionContext {
  return {
    workspaceId: state.workspaceId,
    actor: {
      type: "plugin",
      id: state.pluginId,
      displayName: state.manifest.name,
    },
    capabilities: state.approvedCapabilities.filter((capability): capability is Capability =>
      capability.startsWith("crm:")
    ),
  }
}

function requiredCapability(kind: "read", name: ReadName): Capability
function requiredCapability(kind: "write", name: WriteName): Capability
function requiredCapability(kind: "read" | "write", name: ReadName | WriteName): Capability {
  return `crm:${kind}:${name}` as Capability
}

function clonePluginState(state: ExtensionPluginState): ExtensionPluginState {
  return {
    ...state,
    manifest: {
      ...state.manifest,
      capabilities: [...state.manifest.capabilities],
      contributes: cloneContributions(state.manifest.contributes),
    },
    approvedCapabilities: [...state.approvedCapabilities],
  }
}

function cloneContributions(
  contributions: PluginManifest["contributes"],
): PluginManifest["contributes"] {
  return {
    fields: contributions.fields?.map((field) => ({ ...field })),
    collectionProfiles: contributions.collectionProfiles?.map((profile) => ({
      ...profile,
      allowedStatuses: profile.allowedStatuses ? [...profile.allowedStatuses] : undefined,
      allowedOutcomes: profile.allowedOutcomes ? [...profile.allowedOutcomes] : undefined,
      requiredRelated: profile.requiredRelated ? [...profile.requiredRelated] : undefined,
      optionalRelated: profile.optionalRelated ? [...profile.optionalRelated] : undefined,
    })),
    policies: contributions.policies?.map((policy) => ({ ...policy })),
    workflows: contributions.workflows?.map((workflow) => ({
      ...workflow,
      listensTo: [...workflow.listensTo],
      writes: workflow.writes ? [...workflow.writes] : undefined,
    })),
    commands: contributions.commands?.map((command) => ({
      ...command,
      requires: [...command.requires],
    })),
    uiSlots: contributions.uiSlots?.map((slot) => ({ ...slot })),
    syncs: contributions.syncs?.map((sync) => ({ ...sync })),
  }
}

function cloneCursor(cursor: ExtensionEventCursor): ExtensionEventCursor {
  return { ...cursor, listensTo: [...cursor.listensTo] }
}

function pluginKey(workspaceId: string, pluginId: string): string {
  return `${workspaceId}:${pluginId}`
}

function cursorKey(
  input: { workspaceId: string; pluginId: string; subscriptionId: string },
): string {
  return `${input.workspaceId}:${input.pluginId}:${input.subscriptionId}`
}

function secretKey(input: SecretRef): string {
  return `${input.workspaceId}:${input.pluginId}:${input.key}`
}
