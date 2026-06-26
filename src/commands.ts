import type { EntityRef } from "./types.ts"
import type { ExtensionHost } from "./extensions.ts"
import type { PluginRuntimeCapability } from "./plugins.ts"

export type PluginCommandRunStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "completed"
  | "failed"

export type PluginCommandActionType =
  | "dismiss"
  | "approve_one"
  | "approve_batch"
  | "create_task"
  | "create_note"
  | "create_activity"
  | "open_review"

export type PluginCommandAction = {
  id: string
  type: PluginCommandActionType
  label: string
  targetId?: string
  requiresApproval?: boolean
}

export type PluginCommandCard = {
  id: string
  type: string
  title: string
  rows?: Array<Record<string, unknown>>
  actions?: PluginCommandAction[]
}

export type PluginCommandRunError = {
  code: string
  message: string
}

export type PluginCommandRunResult = {
  runId: string
  status: PluginCommandRunStatus
  summary: string
  messages: string[]
  cards: PluginCommandCard[]
  actions: PluginCommandAction[]
  createdRefs: EntityRef[]
  errors: PluginCommandRunError[]
}

export type PluginCommandInvokeInput = {
  workspaceId: string
  pluginId: string
  commandId: string
  prompt?: string
  input?: Record<string, unknown>
  recordRef?: EntityRef
  chatId?: string
  idempotencyKey?: string
}

export type PluginCommandHandlerInput = PluginCommandInvokeInput & {
  host: ExtensionHost
}

export type PluginCommandHandlerResult =
  & Partial<
    Omit<PluginCommandRunResult, "runId" | "errors">
  >
  & {
    errors?: PluginCommandRunError[]
  }

export type PluginCommandHandler = (
  input: PluginCommandHandlerInput,
) => Promise<PluginCommandHandlerResult> | PluginCommandHandlerResult

export type PluginCommandRuntimeOptions = {
  host: ExtensionHost
  handlers: Record<string, PluginCommandHandler>
  id?: () => string
}

export type PluginCommandRuntime = {
  invoke(input: PluginCommandInvokeInput): Promise<PluginCommandRunResult>
}

export class PluginCommandRuntimeError extends Error {
  constructor(
    readonly code:
      | "command.plugin_not_installed"
      | "command.plugin_disabled"
      | "command.not_declared"
      | "command.capability_not_approved"
      | "command.handler_missing",
    message: string,
  ) {
    super(message)
    this.name = "PluginCommandRuntimeError"
  }
}

export function createPluginCommandRuntime(
  options: PluginCommandRuntimeOptions,
): PluginCommandRuntime {
  const id = options.id ?? (() => crypto.randomUUID())

  return {
    async invoke(input) {
      const runId = id()
      const state = options.host.getPluginState({
        workspaceId: input.workspaceId,
        pluginId: input.pluginId,
      })
      if (!state) {
        throw new PluginCommandRuntimeError(
          "command.plugin_not_installed",
          `Plugin is not installed in workspace: ${input.pluginId}`,
        )
      }
      if (!state.enabled) {
        throw new PluginCommandRuntimeError(
          "command.plugin_disabled",
          `Plugin is disabled in workspace: ${input.pluginId}`,
        )
      }

      const command = state.manifest.contributes.commands?.find((candidate) =>
        candidate.id === input.commandId
      )
      if (!command) {
        throw new PluginCommandRuntimeError(
          "command.not_declared",
          `Plugin command is not declared: ${input.commandId}`,
        )
      }

      for (const required of command.requires) {
        if (!isCapabilityApproved(state.approvedCapabilities, required)) {
          throw new PluginCommandRuntimeError(
            "command.capability_not_approved",
            `Plugin command capability is not approved: ${required}`,
          )
        }
      }

      const handler = options.handlers[handlerKey(input.pluginId, input.commandId)]
      if (!handler) {
        throw new PluginCommandRuntimeError(
          "command.handler_missing",
          `Plugin command handler is not registered: ${input.commandId}`,
        )
      }

      try {
        const result = await handler({ ...input, host: options.host })
        return normalizeResult(runId, result)
      } catch (error) {
        return normalizeResult(runId, {
          status: "failed",
          summary: "Command failed",
          errors: [{
            code: "command.handler_failed",
            message: error instanceof Error ? error.message : "Unknown command failure",
          }],
        })
      }
    },
  }
}

export function pluginCommandHandlerKey(pluginId: string, commandId: string): string {
  return handlerKey(pluginId, commandId)
}

function handlerKey(pluginId: string, commandId: string): string {
  return `${pluginId}:${commandId}`
}

function normalizeResult(
  runId: string,
  result: PluginCommandHandlerResult,
): PluginCommandRunResult {
  return {
    runId,
    status: result.status ?? "completed",
    summary: result.summary ?? "",
    messages: result.messages ?? [],
    cards: result.cards ?? [],
    actions: result.actions ?? [],
    createdRefs: result.createdRefs ?? [],
    errors: result.errors ?? [],
  }
}

function isCapabilityApproved(
  approved: PluginRuntimeCapability[],
  required: PluginRuntimeCapability,
): boolean {
  return approved.includes("crm:*") ||
    approved.includes(required) ||
    (required.startsWith("crm:read:") && approved.includes("crm:read")) ||
    (required.startsWith("crm:write:") && approved.includes("crm:write"))
}
