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
  const bareGmail = await readManifest("examples/plugins/bare-gmail.json")
  const bareGoogleTasks = await readManifest("examples/plugins/bare-google-tasks.json")
  const bareGranola = await readManifest("examples/plugins/bare-granola.json")
  const bareInstagram = await readManifest("examples/plugins/bare-instagram.json")
  const bareReddit = await readManifest("examples/plugins/bare-reddit.json")

  assertEquals(followUps.id, "example.follow-ups")
  assertEquals(csvImport.id, "example.csv-import")
  assertEquals(bareGmail.id, "bare.gmail")
  assertEquals(bareGoogleTasks.id, "bare.google-tasks")
  assertEquals(bareGranola.id, "bare.granola")
  assertEquals(bareInstagram.id, "bare.instagram")
  assertEquals(bareReddit.id, "bare.reddit")
  assertEquals(followUps.contributes.workflows?.[0].writes, ["task.create"])
  assertEquals(csvImport.contributes.commands?.[0].requires.includes("files:read"), true)
  assertEquals(bareGmail.contributes.syncs?.[0].system, "gmail")
  assertEquals(bareGoogleTasks.contributes.syncs?.[0].system, "google-tasks")
  assertEquals(bareGranola.contributes.syncs?.[0].system, "granola")
  assertEquals(bareInstagram.contributes.syncs?.[0].system, "instagram")
  assertEquals(bareReddit.contributes.syncs?.[0].system, "reddit")
  assertEquals(bareGmail.contributes.collectionProfiles?.[0].id, "gmail.thread")
  assertEquals(bareGranola.contributes.collectionProfiles?.[0].id, "granola.meeting-series")
  assertEquals(bareInstagram.contributes.collectionProfiles?.[0].id, "instagram.thread")
  assertEquals(bareReddit.contributes.collectionProfiles?.[0].id, "reddit.thread")
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

Deno.test("plugin manifest validation accepts workbench UI slot metadata", () => {
  const manifest = validatePluginManifest({
    id: "example.workbench-ui",
    name: "Workbench UI",
    version: "0.1.0",
    capabilities: ["plugin:ui", "crm:read:record.search"],
    contributes: {
      uiSlots: [{
        id: "stalled-deal-card",
        slot: "agent.responseCard",
        label: "Stalled deal follow-ups",
        description: "Review follow-up drafts for quiet opportunities.",
        icon: "Mail",
        route: "/follow-ups",
        commandId: "followups.stalled_deals",
        recordTypes: ["deal", "company", "person"],
        requires: ["plugin:ui", "crm:read:record.search"],
      }],
    },
  })

  assertEquals(manifest.contributes.uiSlots?.[0], {
    id: "stalled-deal-card",
    slot: "agent.responseCard",
    label: "Stalled deal follow-ups",
    description: "Review follow-up drafts for quiet opportunities.",
    icon: "Mail",
    route: "/follow-ups",
    commandId: "followups.stalled_deals",
    recordTypes: ["deal", "company", "person"],
    requires: ["plugin:ui", "crm:read:record.search"],
  })
})

Deno.test("plugin manifest validation rejects unknown UI slots", () => {
  assertThrows(
    () =>
      validatePluginManifest({
        id: "example.bad-ui",
        name: "Bad UI",
        version: "0.1.0",
        capabilities: ["plugin:ui"],
        contributes: {
          uiSlots: [{ id: "bad", slot: "workspace.footer" }],
        },
      }),
    PluginManifestError,
    "Unknown plugin UI slot",
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
