import type { ActorType, Capability, EntityType, ExecutionContext } from "./types.ts"

export type PluginRuntimeCapability =
  | Capability
  | "plugin:fields"
  | "plugin:policies"
  | "plugin:workflows"
  | "plugin:commands"
  | "plugin:ui"
  | "plugin:sync"
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

export type PluginUiSlotContribution = {
  id: string
  slot: "record.sidebar" | "record.header" | "workspace.nav" | "command.palette"
}

export type PluginSyncContribution = {
  id: string
  name: string
  system: string
  direction: "import" | "export" | "bidirectional"
}

export type PluginContributions = {
  fields?: PluginFieldContribution[]
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
  "network:external",
  "secrets:read",
  "files:read",
  "files:write",
])

const contributionKeys = ["fields", "policies", "workflows", "commands", "uiSlots", "syncs"]

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

  return value as PluginContributions
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
