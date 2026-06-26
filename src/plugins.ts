import type { ActorType, Capability, EntityType, ExecutionContext } from "./types.ts"

export type PluginRuntimeCapability =
  | Capability
  | "plugin:fields"
  | "plugin:policies"
  | "plugin:workflows"
  | "plugin:commands"
  | "plugin:ui"
  | "plugin:sync"
  | "plugin:profiles"
  | "network:external"
  | "secrets:read"
  | "files:read"
  | "files:write"

export type PluginFieldContribution = {
  entity: EntityType
  key: string
  label: string
  type: "string" | "number" | "boolean" | "datetime" | "json"
  required?: boolean
}

export type PluginCollectionProfileContribution = {
  id: string
  name: string
  allowedStatuses?: string[]
  allowedOutcomes?: string[]
  requiredRelated?: EntityType[]
  optionalRelated?: EntityType[]
}

export type PluginPolicyContribution = {
  id: string
  name: string
  operations: string[]
  mode: "warn" | "block"
}

export type PluginWorkflowContribution = {
  id: string
  name: string
  listensTo: string[]
  writes?: string[]
}

export type PluginCommandContribution = {
  id: string
  name: string
  description?: string
  requires: PluginRuntimeCapability[]
}

export type PluginUiSlotName =
  | "workspace.nav"
  | "workspace.route"
  | "record.header"
  | "record.sidebar"
  | "command.palette"
  | "command.composer"
  | "agent.responseCard"

export type PluginUiSlotContribution = {
  id: string
  slot: PluginUiSlotName
  label?: string
  description?: string
  icon?: string
  route?: string
  commandId?: string
  recordTypes?: EntityType[]
  requires?: PluginRuntimeCapability[]
}

export type PluginSyncContribution = {
  id: string
  name: string
  system: string
  direction: "import" | "export" | "bidirectional"
}

export type PluginContributions = {
  fields?: PluginFieldContribution[]
  collectionProfiles?: PluginCollectionProfileContribution[]
  policies?: PluginPolicyContribution[]
  workflows?: PluginWorkflowContribution[]
  commands?: PluginCommandContribution[]
  uiSlots?: PluginUiSlotContribution[]
  syncs?: PluginSyncContribution[]
}

export type PluginManifest = {
  id: string
  name: string
  version: string
  description?: string
  capabilities: PluginRuntimeCapability[]
  contributes: PluginContributions
}

export class PluginManifestError extends Error {
  constructor(
    readonly code:
      | "plugin.invalid"
      | "plugin.capability_forbidden"
      | "plugin.capability_unknown",
    message: string,
  ) {
    super(message)
    this.name = "PluginManifestError"
  }
}

const allowedRuntimeCapabilities = new Set<PluginRuntimeCapability>([
  "crm:*",
  "crm:read",
  "crm:write",
  "plugin:fields",
  "plugin:policies",
  "plugin:workflows",
  "plugin:commands",
  "plugin:ui",
  "plugin:sync",
  "plugin:profiles",
  "network:external",
  "secrets:read",
  "files:read",
  "files:write",
])

const contributionKeys = [
  "fields",
  "collectionProfiles",
  "policies",
  "workflows",
  "commands",
  "uiSlots",
  "syncs",
]

const allowedUiSlots = new Set<PluginUiSlotName>([
  "workspace.nav",
  "workspace.route",
  "record.header",
  "record.sidebar",
  "command.palette",
  "command.composer",
  "agent.responseCard",
])

const allowedEntityTypes = new Set<EntityType>([
  "person",
  "company",
  "deal",
  "collection",
  "activity",
  "note",
  "task",
  "file",
  "relation",
])

export function validatePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new PluginManifestError("plugin.invalid", "Plugin manifest must be an object")
  }

  assertString(value.id, "id")
  assertString(value.name, "name")
  assertString(value.version, "version")

  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(value.id)) {
    throw new PluginManifestError(
      "plugin.invalid",
      "Plugin manifest id must use lowercase reverse-DNS-like segments",
    )
  }
  if (!/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/.test(value.version)) {
    throw new PluginManifestError(
      "plugin.invalid",
      "Plugin manifest version must be semver-like",
    )
  }
  if (!Array.isArray(value.capabilities)) {
    throw new PluginManifestError("plugin.invalid", "Plugin manifest capabilities must be an array")
  }

  const capabilities = value.capabilities.map((capability) => {
    assertString(capability, "capability")
    assertAllowedCapability(capability)
    return capability as PluginRuntimeCapability
  })

  const contributes = normalizeContributions(value.contributes)

  return {
    id: value.id,
    name: value.name,
    version: value.version,
    description: typeof value.description === "string" ? value.description : undefined,
    capabilities,
    contributes,
  }
}

export function kernelCapabilitiesFromPlugin(
  manifest: PluginManifest,
): Capability[] {
  return manifest.capabilities
    .filter((capability): capability is Capability => capability.startsWith("crm:"))
}

export function createPluginExecutionContext(
  manifest: PluginManifest,
  input: { workspaceId: string; actorId?: string; displayName?: string },
): ExecutionContext {
  return {
    workspaceId: input.workspaceId,
    actor: {
      type: "plugin" satisfies ActorType,
      id: input.actorId ?? manifest.id,
      displayName: input.displayName ?? manifest.name,
    },
    capabilities: kernelCapabilitiesFromPlugin(manifest),
  }
}

function normalizeContributions(value: unknown): PluginContributions {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    throw new PluginManifestError("plugin.invalid", "Plugin manifest contributes must be an object")
  }

  for (const key of Object.keys(value)) {
    if (!contributionKeys.includes(key)) {
      throw new PluginManifestError("plugin.invalid", `Unknown plugin contribution key: ${key}`)
    }
    if (!Array.isArray(value[key])) {
      throw new PluginManifestError(
        "plugin.invalid",
        `Plugin contribution ${key} must be an array`,
      )
    }
  }

  const contributions = value as PluginContributions
  for (const slot of contributions.uiSlots ?? []) {
    validateUiSlotContribution(slot)
  }

  return contributions
}

function validateUiSlotContribution(value: unknown): asserts value is PluginUiSlotContribution {
  if (!isRecord(value)) {
    throw new PluginManifestError("plugin.invalid", "Plugin UI slot contribution must be an object")
  }
  assertString(value.id, "uiSlots.id")
  assertString(value.slot, "uiSlots.slot")
  if (!allowedUiSlots.has(value.slot as PluginUiSlotName)) {
    throw new PluginManifestError(
      "plugin.invalid",
      `Unknown plugin UI slot: ${value.slot}`,
    )
  }

  for (const optional of ["label", "description", "icon", "route", "commandId"]) {
    if (value[optional] !== undefined && typeof value[optional] !== "string") {
      throw new PluginManifestError(
        "plugin.invalid",
        `Plugin UI slot ${optional} must be a string`,
      )
    }
  }

  if (value.recordTypes !== undefined) {
    if (!Array.isArray(value.recordTypes)) {
      throw new PluginManifestError(
        "plugin.invalid",
        "Plugin UI slot recordTypes must be an array",
      )
    }
    for (const recordType of value.recordTypes) {
      assertString(recordType, "uiSlots.recordTypes")
      if (!allowedEntityTypes.has(recordType as EntityType)) {
        throw new PluginManifestError(
          "plugin.invalid",
          `Unknown plugin UI slot record type: ${recordType}`,
        )
      }
    }
  }

  if (value.requires !== undefined) {
    if (!Array.isArray(value.requires)) {
      throw new PluginManifestError("plugin.invalid", "Plugin UI slot requires must be an array")
    }
    for (const capability of value.requires) {
      assertString(capability, "uiSlots.requires")
      assertAllowedCapability(capability)
    }
  }
}

function assertAllowedCapability(capability: string): void {
  if (capability.startsWith("storage:")) {
    throw new PluginManifestError(
      "plugin.capability_forbidden",
      "Plugins cannot request direct Storage API access",
    )
  }

  if (
    capability.startsWith("crm:read:") ||
    capability.startsWith("crm:write:") ||
    allowedRuntimeCapabilities.has(capability as PluginRuntimeCapability)
  ) {
    return
  }

  throw new PluginManifestError(
    "plugin.capability_unknown",
    `Unknown plugin capability: ${capability}`,
  )
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PluginManifestError("plugin.invalid", `Plugin manifest ${field} is required`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
