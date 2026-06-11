import { type PluginManifest, PluginManifestError, validatePluginManifest } from "./plugins.ts"
import type {
  Capability,
  CrmEvent,
  CrmEventName,
  CrmKernel,
  EntityRef,
  EventListInput,
  SourceKind,
} from "./types.ts"

export type AdminStatus = "ok" | "warn" | "fail"

export type AdminDoctorCheck = {
  code: string
  status: AdminStatus
  message: string
}

export type AdminDoctorReport = {
  status: AdminStatus
  checkedAt: string
  redacted: true
  externalTelemetry: false
  checks: AdminDoctorCheck[]
}

export type AdminEventMetadata = {
  id: string
  workspaceId: string
  name: CrmEventName
  operation: CrmEvent["operation"]
  recordRef: EntityRef
  recordVersion: number
  occurredAt: string
  writeId: string
  source: SourceKind
  actorType?: CrmEvent["actorType"]
  actorId?: string
  actorDisplayName?: string
  causationId?: string
  correlationId?: string
  idempotencyKey?: string
}

export type AdminPluginValidationResult =
  | {
    ok: true
    manifest: PluginManifest
    summary: {
      id: string
      name: string
      version: string
      capabilities: number
      kernelCapabilities: Capability[]
    }
  }
  | {
    ok: false
    error: {
      code: string
      message: string
    }
  }

export type CrmAdmin = {
  doctor(): AdminDoctorReport
  listEventMetadata(input: EventListInput): Promise<AdminEventMetadata[]>
  validatePluginManifest(value: unknown): AdminPluginValidationResult
}

export type CrmAdminOptions = {
  crm: CrmKernel
  now?: () => Date
}

const doctorChecks: AdminDoctorCheck[] = [
  {
    code: "cli.available",
    status: "ok",
    message: "CLI command surface is available.",
  },
  {
    code: "privacy.no_external_telemetry",
    status: "ok",
    message: "Doctor does not send CRM records, events, or diagnostics to an external service.",
  },
  {
    code: "plugin.storage_access_forbidden",
    status: "ok",
    message: "Plugin manifests are validated against direct Storage API capabilities.",
  },
  {
    code: "db.live_integrity_not_configured",
    status: "warn",
    message: "No live database target was provided, so storage integrity was not checked.",
  },
]

export function createCrmAdmin(options: CrmAdminOptions): CrmAdmin {
  const now = options.now ?? (() => new Date())

  return {
    doctor() {
      return {
        status: summaryStatus(doctorChecks),
        checkedAt: now().toISOString(),
        redacted: true,
        externalTelemetry: false,
        checks: doctorChecks.map((check) => ({ ...check })),
      }
    },

    async listEventMetadata(input) {
      const events = await options.crm.read("event.list", input)
      return events.map(eventMetadata)
    },

    validatePluginManifest(value) {
      try {
        const manifest = validatePluginManifest(value)
        return {
          ok: true,
          manifest,
          summary: {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            capabilities: manifest.capabilities.length,
            kernelCapabilities: manifest.capabilities.filter((
              capability,
            ): capability is Capability => capability.startsWith("crm:")),
          },
        }
      } catch (error) {
        if (error instanceof PluginManifestError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
            },
          }
        }
        throw error
      }
    },
  }
}

function eventMetadata(event: CrmEvent): AdminEventMetadata {
  return compactObject({
    id: event.id,
    workspaceId: event.workspaceId,
    name: event.name,
    operation: event.operation,
    recordRef: event.recordRef,
    recordVersion: event.recordVersion,
    occurredAt: event.occurredAt,
    writeId: event.writeId,
    source: event.source,
    actorType: event.actorType,
    actorId: event.actorId,
    actorDisplayName: event.actorDisplayName,
    causationId: event.causationId,
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
  })
}

function summaryStatus(checks: AdminDoctorCheck[]): AdminStatus {
  if (checks.some((check) => check.status === "fail")) return "fail"
  if (checks.some((check) => check.status === "warn")) return "warn"
  return "ok"
}

function compactObject<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T
}
