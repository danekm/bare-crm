import type { Activity, AnyRecord, Company, Deal, Person } from "../../types.ts"
import type { PluginCommandHandler, PluginCommandHandlerResult } from "../../commands.ts"

export type StalledDealFollowupOptions = {
  now?: () => Date
  staleAfterDays?: number
}

export type FollowupDraftRow = {
  id: string
  dealId: string
  subject: string
  preview: string
  recipient: string
  account: string
  rationale: string
}

export const bareFollowupsManifest = {
  id: "bare.followups",
  name: "Bare Follow-ups",
  version: "0.1.0",
  description: "Reference plugin that drafts review-only follow-ups for stalled open deals.",
  capabilities: [
    "crm:read:record.search",
    "plugin:commands",
    "plugin:ui",
  ],
  contributes: {
    commands: [{
      id: "followups.stalled_deals",
      name: "Draft follow-ups for stalled deals",
      description: "Find quiet open deals and produce review-only email draft suggestions.",
      requires: ["plugin:commands", "crm:read:record.search"],
    }],
    uiSlots: [
      {
        id: "followups-nav",
        slot: "workspace.nav",
        label: "Stalled follow-ups",
        icon: "Mail",
        route: "/follow-ups",
        commandId: "followups.stalled_deals",
        requires: ["plugin:ui"],
      },
      {
        id: "followups-route",
        slot: "workspace.route",
        label: "Stalled follow-ups",
        route: "/follow-ups",
        commandId: "followups.stalled_deals",
        requires: ["plugin:ui"],
      },
      {
        id: "followups-response-card",
        slot: "agent.responseCard",
        label: "Follow-ups for stalled deals",
        commandId: "followups.stalled_deals",
        recordTypes: ["deal", "company", "person"],
        requires: ["plugin:ui"],
      },
    ],
  },
} as const

export function createStalledDealFollowupHandler(
  options: StalledDealFollowupOptions = {},
): PluginCommandHandler {
  const now = options.now ?? (() => new Date())
  const staleAfterDays = options.staleAfterDays ?? 14

  return async ({ workspaceId, pluginId, host }): Promise<PluginCommandHandlerResult> => {
    const [deals, people, companies, activities] = await Promise.all([
      host.readAsPlugin({
        workspaceId,
        pluginId,
        name: "record.search",
        input: { workspaceId, type: "deal", limit: 100 },
      }),
      host.readAsPlugin({
        workspaceId,
        pluginId,
        name: "record.search",
        input: { workspaceId, type: "person", limit: 100 },
      }),
      host.readAsPlugin({
        workspaceId,
        pluginId,
        name: "record.search",
        input: { workspaceId, type: "company", limit: 100 },
      }),
      host.readAsPlugin({
        workspaceId,
        pluginId,
        name: "record.search",
        input: { workspaceId, type: "activity", limit: 200 },
      }),
    ])

    const rows = findStalledDealDrafts({
      deals: deals.filter(isDeal),
      people: people.filter(isPerson),
      companies: companies.filter(isCompany),
      activities: activities.filter(isActivity),
      now: now(),
      staleAfterDays,
    })

    return {
      status: "needs_review",
      summary: rows.length
        ? `Drafted ${rows.length} follow-up${rows.length === 1 ? "" : "s"} for stalled deals.`
        : "No stalled deals need follow-up.",
      messages: rows.length
        ? ["Review each draft before sending. No email has been sent."]
        : ["No eligible open or paused deals were stale enough for a follow-up."],
      cards: rows.length
        ? [{
          id: "followups.stalled_deals.card",
          type: "followup.emailDrafts",
          title: "Follow-ups for stalled deals",
          rows,
          actions: [
            { id: "dismiss-all", type: "dismiss", label: "Dismiss all" },
            {
              id: "approve-all",
              type: "approve_batch",
              label: `Review all ${rows.length}`,
              requiresApproval: true,
            },
          ],
        }]
        : [],
      actions: rows.flatMap((row) => [
        { id: `dismiss:${row.id}`, type: "dismiss", label: "Dismiss", targetId: row.id },
        {
          id: `review:${row.id}`,
          type: "open_review",
          label: "Review draft",
          targetId: row.id,
          requiresApproval: true,
        },
      ]),
    }
  }
}

export function findStalledDealDrafts(input: {
  deals: Deal[]
  people: Person[]
  companies: Company[]
  activities: Activity[]
  now: Date
  staleAfterDays: number
}): FollowupDraftRow[] {
  const peopleById = new Map(input.people.map((person) => [person.id, person]))
  const companiesById = new Map(input.companies.map((company) => [company.id, company]))
  const cutoff = input.now.getTime() - input.staleAfterDays * 24 * 60 * 60 * 1000

  return input.deals
    .filter((deal) => deal.status === "open" || deal.status === "paused")
    .map((deal) => {
      const company = deal.companyId ? companiesById.get(deal.companyId) : undefined
      const person = (deal.personIds ?? []).map((id) => peopleById.get(id)).find(Boolean)
      const lastActivity = latestActivityForDeal(deal, input.activities)
      const lastSignalAt = lastActivity?.occurredAt ?? deal.updatedAt
      return { deal, company, person, lastActivity, lastSignalAt }
    })
    .filter((candidate) => Date.parse(candidate.lastSignalAt) <= cutoff)
    .map(({ deal, company, person, lastActivity }) => {
      const recipient = person?.name ?? "Unknown contact"
      const account = company?.name ?? "Unknown account"
      const subjectTopic = lastActivity?.subject ?? deal.name
      return {
        id: `draft:${deal.id}`,
        dealId: deal.id,
        subject: `RE: ${subjectTopic}`,
        preview: person
          ? `Following up on ${deal.name} and the next step we discussed.`
          : `Add a contact before sending a follow-up for ${deal.name}.`,
        recipient,
        account,
        rationale: lastActivity
          ? `Last activity was ${lastActivity.kind} on ${lastActivity.occurredAt.slice(0, 10)}.`
          : `Deal has no recent activity and was last updated on ${deal.updatedAt.slice(0, 10)}.`,
      }
    })
}

function latestActivityForDeal(deal: Deal, activities: Activity[]): Activity | undefined {
  const explicitlyRelated = activities.filter((activity) =>
    (activity.related ?? []).some((ref) => ref.type === "deal" && ref.id === deal.id)
  )
  const candidates = explicitlyRelated.length > 0
    ? explicitlyRelated
    : activities.filter((activity) =>
      (deal.personIds ?? []).some((personId) =>
        (activity.participants ?? []).some((ref) => ref.type === "person" && ref.id === personId)
      )
    )
  return candidates.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0]
}

function isDeal(record: AnyRecord): record is Deal {
  return record.type === "deal"
}

function isPerson(record: AnyRecord): record is Person {
  return record.type === "person"
}

function isCompany(record: AnyRecord): record is Company {
  return record.type === "company"
}

function isActivity(record: AnyRecord): record is Activity {
  return record.type === "activity"
}
