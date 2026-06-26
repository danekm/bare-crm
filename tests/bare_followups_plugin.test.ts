import { assertEquals } from "jsr:@std/assert"
import {
  bareFollowupsManifest,
  createCrmKernel,
  createExtensionHost,
  createPluginCommandRuntime,
  createStalledDealFollowupHandler,
  pluginCommandHandlerKey,
} from "../src/index.ts"

Deno.test("bare followups drafts review-only rows for stalled deals", async () => {
  const { runtime } = await setupFollowupsRuntime()

  const result = await runtime.invoke({
    workspaceId: "workspace_1",
    pluginId: "bare.followups",
    commandId: "followups.stalled_deals",
    prompt: "write emails to stalled deals",
  })

  assertEquals(result.status, "needs_review")
  assertEquals(result.summary, "Drafted 2 follow-ups for stalled deals.")
  assertEquals(result.cards.length, 1)
  assertEquals(result.cards[0].type, "followup.emailDrafts")
  assertEquals(result.cards[0].rows?.map((row) => row.dealId), [
    "deal_atlas",
    "deal_beacon",
  ])
  assertEquals(result.actions.length, 4)
})

Deno.test("bare followups returns empty review result when no deals are stale", async () => {
  const { runtime } = await setupFollowupsRuntime({ recentOnly: true })

  const result = await runtime.invoke({
    workspaceId: "workspace_1",
    pluginId: "bare.followups",
    commandId: "followups.stalled_deals",
  })

  assertEquals(result.status, "needs_review")
  assertEquals(result.summary, "No stalled deals need follow-up.")
  assertEquals(result.cards, [])
  assertEquals(result.actions, [])
})

Deno.test("bare followups handles missing contacts and duplicate deal names", async () => {
  const { runtime } = await setupFollowupsRuntime({ duplicateMissingContacts: true })

  const result = await runtime.invoke({
    workspaceId: "workspace_1",
    pluginId: "bare.followups",
    commandId: "followups.stalled_deals",
  })

  const rows = result.cards[0].rows ?? []
  assertEquals(rows.map((row) => row.dealId), ["deal_duplicate_1", "deal_duplicate_2"])
  assertEquals(rows.map((row) => row.recipient), ["Unknown contact", "Unknown contact"])
  assertEquals(rows.map((row) => row.id), ["draft:deal_duplicate_1", "draft:deal_duplicate_2"])
})

async function setupFollowupsRuntime(options: {
  recentOnly?: boolean
  duplicateMissingContacts?: boolean
} = {}) {
  const crm = createCrmKernel({ now: fixedNow, id: sequenceId() })
  const host = createExtensionHost({ crm, now: fixedNow })

  host.installPlugin({
    workspaceId: "workspace_1",
    manifest: bareFollowupsManifest,
    approvedCapabilities: ["plugin:commands", "crm:read:record.search", "plugin:ui"],
    enabled: true,
  })

  await crm.write("company.create", {
    workspaceId: "workspace_1",
    id: "company_beacon",
    name: "Beacon",
  })
  await crm.write("company.create", {
    workspaceId: "workspace_1",
    id: "company_atlas",
    name: "Atlas Labs",
  })
  await crm.write("person.create", {
    workspaceId: "workspace_1",
    id: "person_david",
    name: "David Park",
    companyId: "company_beacon",
  })
  await crm.write("person.create", {
    workspaceId: "workspace_1",
    id: "person_james",
    name: "James Liu",
    companyId: "company_atlas",
  })

  if (options.duplicateMissingContacts) {
    await createDealWithActivity(
      "deal_duplicate_1",
      "Beacon rollout",
      "company_beacon",
      [],
      "2026-05-01",
    )
    await createDealWithActivity(
      "deal_duplicate_2",
      "Beacon rollout",
      "company_beacon",
      [],
      "2026-05-02",
    )
  } else {
    const oldDate = options.recentOnly ? "2026-06-24" : "2026-05-20"
    await createDealWithActivity(
      "deal_beacon",
      "Beacon demo",
      "company_beacon",
      ["person_david"],
      oldDate,
    )
    await createDealWithActivity(
      "deal_atlas",
      "Atlas rollout",
      "company_atlas",
      ["person_james"],
      oldDate,
    )
    await createDealWithActivity(
      "deal_recent",
      "Recent demo",
      "company_beacon",
      ["person_david"],
      "2026-06-24",
    )
    await crm.write("deal.create", {
      workspaceId: "workspace_1",
      id: "deal_won",
      name: "Closed deal",
      companyId: "company_atlas",
      personIds: ["person_james"],
      stage: "Closed",
      status: "won",
    })
  }

  const runtime = createPluginCommandRuntime({
    host,
    id: () => "run_followups",
    handlers: {
      [pluginCommandHandlerKey("bare.followups", "followups.stalled_deals")]:
        createStalledDealFollowupHandler({ now: fixedNow }),
    },
  })

  return { crm, host, runtime }

  async function createDealWithActivity(
    id: string,
    name: string,
    companyId: string,
    personIds: string[],
    occurredAt: string,
  ) {
    await crm.write("deal.create", {
      workspaceId: "workspace_1",
      id,
      name,
      companyId,
      personIds,
      stage: "Proposal",
      status: "open",
    })
    await crm.write("activity.create", {
      workspaceId: "workspace_1",
      id: `activity_${id}`,
      kind: "email",
      subject: name,
      occurredAt: `${occurredAt}T12:00:00.000Z`,
      participants: personIds.map((personId) => ({ type: "person", id: personId })),
      related: [{ type: "deal", id }],
    })
  }
}

function fixedNow(): Date {
  return new Date("2026-06-25T00:00:00.000Z")
}

function sequenceId(): () => string {
  let index = 0
  return () => `id_${++index}`
}
