import { assertEquals, assertThrows } from "jsr:@std/assert"
import {
  createPluginExecutionContext,
  kernelCapabilitiesFromPlugin,
  PluginManifestError,
  validatePluginManifest,
} from "../src/index.ts"

Deno.test("plugin examples are valid manifests", async () => {
  const followUps = await readManifest("examples/plugins/follow-up-reminders.json")
  const csvImport = await readManifest("examples/plugins/csv-import-helper.json")

  assertEquals(followUps.id, "example.follow-ups")
  assertEquals(csvImport.id, "example.csv-import")
  assertEquals(followUps.contributes.workflows?.[0].writes, ["task.create"])
  assertEquals(csvImport.contributes.commands?.[0].requires.includes("files:read"), true)
})

Deno.test("plugin manifest validation rejects direct Storage API capability", () => {
  assertThrows(
    () =>
      validatePluginManifest({
        id: "example.bad-storage",
        name: "Bad storage plugin",
        version: "0.1.0",
        capabilities: ["storage:write"],
        contributes: {},
      }),
    PluginManifestError,
    "Storage API",
  )
})

Deno.test("plugin manifest validation rejects unknown capability", () => {
  assertThrows(
    () =>
      validatePluginManifest({
        id: "example.bad-capability",
        name: "Bad capability plugin",
        version: "0.1.0",
        capabilities: ["records:read"],
        contributes: {},
      }),
    PluginManifestError,
    "Unknown plugin capability",
  )
})

Deno.test("plugin execution context exposes only kernel capabilities", async () => {
  const manifest = await readManifest("examples/plugins/csv-import-helper.json")

  assertEquals(kernelCapabilitiesFromPlugin(manifest), [
    "crm:read:record.search",
    "crm:write:person.create",
    "crm:write:company.create",
    "crm:write:record.update",
  ])
  assertEquals(
    createPluginExecutionContext(manifest, {
      workspaceId: "workspace_1",
    }),
    {
      workspaceId: "workspace_1",
      actor: {
        type: "plugin",
        id: "example.csv-import",
        displayName: "CSV import helper",
      },
      capabilities: [
        "crm:read:record.search",
        "crm:write:person.create",
        "crm:write:company.create",
        "crm:write:record.update",
      ],
    },
  )
})

Deno.test("plugin manifest validation requires stable id and version", () => {
  assertThrows(
    () =>
      validatePluginManifest({
        id: "Example Bad",
        name: "Bad plugin",
        version: "0.1.0",
        capabilities: [],
        contributes: {},
      }),
    PluginManifestError,
    "id",
  )
  assertThrows(
    () =>
      validatePluginManifest({
        id: "example.bad-version",
        name: "Bad plugin",
        version: "first",
        capabilities: [],
        contributes: {},
      }),
    PluginManifestError,
    "version",
  )
})

async function readManifest(path: string) {
  return validatePluginManifest(JSON.parse(await Deno.readTextFile(path)))
}
