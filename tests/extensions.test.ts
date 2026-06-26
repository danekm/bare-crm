import { assertEquals, assertRejects } from "jsr:@std/assert"
import {
  createCrmKernel,
  createExtensionHost,
  ExtensionHostError,
  type PluginManifest,
} from "../src/index.ts"

const renewalPlugin: PluginManifest = {
  id: "example.renewal",
  name: "Renewal profiles",
  version: "0.1.0",
  capabilities: [
    "crm:read:event.list",
    "crm:write:collection.create",
    "plugin:profiles",
    "plugin:workflows",
    "secrets:read",
  ],
  contributes: {
    collectionProfiles: [{
      id: "sales.renewal",
      name: "Renewal",
      allowedStatuses: ["open", "waiting", "closed"],
      allowedOutcomes: ["renewed", "churned", "no_decision"],
      requiredRelated: ["company"],
      optionalRelated: ["deal", "activity", "note", "task", "file"],
    }],
    workflows: [{
      id: "renewal-watch",
      name: "Watch renewal collections",
      listensTo: ["collection.created"],
      writes: [],
    }],
  },
}

const workbenchUiPlugin: PluginManifest = {
  id: "example.workbench-ui",
  name: "Workbench UI",
  version: "0.1.0",
  capabilities: ["plugin:ui", "crm:read:record.search"],
  contributes: {
    uiSlots: [{
      id: "followups-nav",
      slot: "workspace.nav",
      label: "Follow-ups",
      icon: "Mail",
      route: "/follow-ups",
      commandId: "followups.stalled_deals",
      recordTypes: ["deal"],
      requires: ["crm:read:record.search"],
    }],
  },
}

Deno.test("extension host stores workspace-scoped plugin state and profiles", () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })

  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: ["plugin:profiles"],
    enabled: true,
  })

  assertEquals(host.listCollectionProfiles({ workspaceId: "workspace_1" }).map((p) => p.id), [
    "sales.renewal",
  ])
  assertEquals(host.listCollectionProfiles({ workspaceId: "workspace_2" }), [])

  host.disablePlugin({ workspaceId: "workspace_1", pluginId: "example.renewal" })
  assertEquals(host.listCollectionProfiles({ workspaceId: "workspace_1" }), [])

  host.enablePlugin({ workspaceId: "workspace_1", pluginId: "example.renewal" })
  const state = host.getPluginState({ workspaceId: "workspace_1", pluginId: "example.renewal" })
  assertEquals(state?.workspaceId, "workspace_1")
  assertEquals(state?.pluginId, "example.renewal")
  assertEquals(state?.manifest.id, "example.renewal")
  assertEquals(state?.approvedCapabilities, ["plugin:profiles"])
  assertEquals(state?.enabled, true)
  assertEquals(state?.installedAt, "2026-01-01T00:00:00.000Z")
  assertEquals(state?.updatedAt, "2026-01-01T00:00:00.000Z")
})

Deno.test("extension host validates collections against profiles outside the kernel", () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: ["plugin:profiles"],
    enabled: true,
  })

  assertEquals(
    host.validateCollection({
      workspaceId: "workspace_1",
      collection: { kind: "missing.profile" },
    }).ok,
    false,
  )
  assertEquals(
    host.validateCollection({
      workspaceId: "workspace_1",
      collection: { kind: "sales.renewal", status: "paused" },
    }),
    {
      ok: false,
      issues: [
        {
          code: "collection.status_invalid",
          message: "Collection status is not allowed for sales.renewal: paused",
          field: "status",
          severity: "block",
        },
        {
          code: "collection.related_required",
          message: "Collection profile sales.renewal requires related company",
          field: "related",
          severity: "block",
        },
      ],
    },
  )
  assertEquals(
    host.validateCollection({
      workspaceId: "workspace_1",
      collection: {
        kind: "sales.renewal",
        status: "open",
        outcome: { code: "renewed" },
        related: [{ type: "company", id: "company_1" }],
      },
    }).ok,
    true,
  )
})

Deno.test("extension host lists UI slots only for enabled plugins with approved UI capability", () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: workbenchUiPlugin,
    approvedCapabilities: [],
    enabled: true,
  })
  assertEquals(host.listUiSlots({ workspaceId: "workspace_1" }), [])

  host.approveCapabilities({
    workspaceId: "workspace_1",
    pluginId: "example.workbench-ui",
    capabilities: ["plugin:ui"],
  })
  assertEquals(host.listUiSlots({ workspaceId: "workspace_1" }), [{
    pluginId: "example.workbench-ui",
    id: "followups-nav",
    slot: "workspace.nav",
    label: "Follow-ups",
    icon: "Mail",
    route: "/follow-ups",
    commandId: "followups.stalled_deals",
    recordTypes: ["deal"],
    requires: ["crm:read:record.search"],
  }])

  host.disablePlugin({ workspaceId: "workspace_1", pluginId: "example.workbench-ui" })
  assertEquals(host.listUiSlots({ workspaceId: "workspace_1" }), [])
})

Deno.test("extension host writes as plugins with approved capabilities", async () => {
  const crm = createCrmKernel({ now: fixedNow, id: sequenceId() })
  const host = createExtensionHost({ crm, now: fixedNow })
  const company = await crm.write("company.create", {
    workspaceId: "workspace_1",
    id: "company_1",
    name: "Acme",
  })

  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: ["plugin:profiles", "crm:write:collection.create"],
    enabled: true,
  })

  const collection = await host.writeAsPlugin({
    workspaceId: "workspace_1",
    pluginId: "example.renewal",
    name: "collection.create",
    input: {
      workspaceId: "workspace_1",
      title: "Acme renewal",
      kind: "sales.renewal",
      status: "open",
      related: [{ type: "company", id: company.id }],
      source: "plugin",
    },
  })

  assertEquals(collection.type, "collection")
  assertEquals(collection.source, "plugin")

  const unapprovedHost = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  unapprovedHost.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: ["plugin:profiles"],
    enabled: true,
  })
  await assertRejects(
    () =>
      unapprovedHost.writeAsPlugin({
        workspaceId: "workspace_1",
        pluginId: "example.renewal",
        name: "collection.create",
        input: {
          workspaceId: "workspace_1",
          title: "Blocked",
          kind: "sales.renewal",
          related: [{ type: "company", id: "company_1" }],
        },
      }),
    ExtensionHostError,
    "not approved",
  )
})

Deno.test("extension host event cursors deliver pending subscribed events", async () => {
  const crm = createCrmKernel({
    now: fixedNow,
    id: sequenceId(),
  })
  const host = createExtensionHost({ crm, now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: ["plugin:workflows", "crm:read:event.list"],
    enabled: true,
  })

  await crm.write("collection.create", {
    workspaceId: "workspace_1",
    id: "collection_1",
    title: "Acme renewal",
    kind: "ad_hoc",
  })
  await crm.write("person.create", {
    workspaceId: "workspace_1",
    id: "person_1",
    name: "Ada",
  })

  const [first] = await host.listPendingEvents({
    workspaceId: "workspace_1",
    pluginId: "example.renewal",
    subscriptionId: "renewal-watch",
  })
  assertEquals(first.name, "collection.created")

  host.ackEvent({
    workspaceId: "workspace_1",
    pluginId: "example.renewal",
    subscriptionId: "renewal-watch",
    eventId: first.id,
  })
  assertEquals(
    await host.listPendingEvents({
      workspaceId: "workspace_1",
      pluginId: "example.renewal",
      subscriptionId: "renewal-watch",
    }),
    [],
  )
})

Deno.test("extension host scopes secrets by workspace and approved plugin capability", async () => {
  const host = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: ["secrets:read"],
    enabled: true,
  })
  host.installPlugin({
    workspaceId: "workspace_2",
    manifest: renewalPlugin,
    approvedCapabilities: ["secrets:read"],
    enabled: true,
  })

  await host.setPluginSecret({
    workspaceId: "workspace_1",
    pluginId: "example.renewal",
    key: "api_key",
    value: "secret_workspace_1",
  })

  assertEquals(
    await host.getPluginSecret({
      workspaceId: "workspace_1",
      pluginId: "example.renewal",
      key: "api_key",
    }),
    "secret_workspace_1",
  )
  assertEquals(
    await host.getPluginSecret({
      workspaceId: "workspace_2",
      pluginId: "example.renewal",
      key: "api_key",
    }),
    null,
  )

  const blocked = createExtensionHost({ crm: createCrmKernel(), now: fixedNow })
  blocked.installPlugin({
    workspaceId: "workspace_1",
    manifest: renewalPlugin,
    approvedCapabilities: [],
    enabled: true,
  })
  await assertRejects(
    () =>
      blocked.getPluginSecret({
        workspaceId: "workspace_1",
        pluginId: "example.renewal",
        key: "api_key",
      }),
    ExtensionHostError,
    "not approved",
  )
})

function fixedNow(): Date {
  return new Date("2026-01-01T00:00:00.000Z")
}

function sequenceId(): () => string {
  let index = 0
  return () => `id_${++index}`
}
