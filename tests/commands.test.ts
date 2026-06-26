import { assertEquals, assertRejects } from "jsr:@std/assert"
import {
  createCrmKernel,
  createExtensionHost,
  createPluginCommandRuntime,
  pluginCommandHandlerKey,
  PluginCommandRuntimeError,
  type PluginManifest,
} from "../src/index.ts"

const commandPlugin: PluginManifest = {
  id: "example.commands",
  name: "Command plugin",
  version: "0.1.0",
  capabilities: ["plugin:commands", "crm:read:record.search", "crm:write:task.create"],
  contributes: {
    commands: [{
      id: "commands.test",
      name: "Test command",
      requires: ["plugin:commands", "crm:read:record.search"],
    }],
  },
}

Deno.test("plugin command runtime invokes approved declared commands", async () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: commandPlugin,
    approvedCapabilities: ["plugin:commands", "crm:read:record.search"],
    enabled: true,
  })
  const runtime = createPluginCommandRuntime({
    host,
    id: () => "run_1",
    handlers: {
      [pluginCommandHandlerKey("example.commands", "commands.test")]: () => ({
        summary: "Found 1 suggestion",
        messages: ["Searched records"],
        cards: [{
          id: "card_1",
          type: "test.card",
          title: "Suggestions",
          rows: [{ id: "row_1", subject: "Follow up" }],
        }],
        actions: [{ id: "approve", type: "approve_one", label: "Approve", targetId: "row_1" }],
      }),
    },
  })

  assertEquals(
    await runtime.invoke({
      workspaceId: "workspace_1",
      pluginId: "example.commands",
      commandId: "commands.test",
      prompt: "test",
    }),
    {
      runId: "run_1",
      status: "completed",
      summary: "Found 1 suggestion",
      messages: ["Searched records"],
      cards: [{
        id: "card_1",
        type: "test.card",
        title: "Suggestions",
        rows: [{ id: "row_1", subject: "Follow up" }],
      }],
      actions: [{ id: "approve", type: "approve_one", label: "Approve", targetId: "row_1" }],
      createdRefs: [],
      errors: [],
    },
  )
})

Deno.test("plugin command runtime blocks disabled plugins", async () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: commandPlugin,
    approvedCapabilities: ["plugin:commands", "crm:read:record.search"],
    enabled: false,
  })
  const runtime = createPluginCommandRuntime({ host, handlers: {} })

  await assertRejects(
    () =>
      runtime.invoke({
        workspaceId: "workspace_1",
        pluginId: "example.commands",
        commandId: "commands.test",
      }),
    PluginCommandRuntimeError,
    "disabled",
  )
})

Deno.test("plugin command runtime blocks missing commands and unapproved capabilities", async () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: commandPlugin,
    approvedCapabilities: ["plugin:commands"],
    enabled: true,
  })
  const runtime = createPluginCommandRuntime({ host, handlers: {} })

  await assertRejects(
    () =>
      runtime.invoke({
        workspaceId: "workspace_1",
        pluginId: "example.commands",
        commandId: "commands.missing",
      }),
    PluginCommandRuntimeError,
    "not declared",
  )

  await assertRejects(
    () =>
      runtime.invoke({
        workspaceId: "workspace_1",
        pluginId: "example.commands",
        commandId: "commands.test",
      }),
    PluginCommandRuntimeError,
    "not approved",
  )
})

Deno.test("plugin command runtime returns safe failed results for handler failures", async () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: commandPlugin,
    approvedCapabilities: ["plugin:commands", "crm:read:record.search"],
    enabled: true,
  })
  const runtime = createPluginCommandRuntime({
    host,
    id: () => "run_failed",
    handlers: {
      [pluginCommandHandlerKey("example.commands", "commands.test")]: () => {
        throw new Error("Provider unavailable")
      },
    },
  })

  assertEquals(
    await runtime.invoke({
      workspaceId: "workspace_1",
      pluginId: "example.commands",
      commandId: "commands.test",
    }),
    {
      runId: "run_failed",
      status: "failed",
      summary: "Command failed",
      messages: [],
      cards: [],
      actions: [],
      createdRefs: [],
      errors: [{ code: "command.handler_failed", message: "Provider unavailable" }],
    },
  )
})

function fixedNow(): Date {
  return new Date("2026-01-01T00:00:00.000Z")
}
