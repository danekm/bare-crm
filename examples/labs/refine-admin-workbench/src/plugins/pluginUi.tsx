import type { ComponentType, ReactNode } from "react"
import { NavLink } from "react-router"
import { Mail, Send, X } from "lucide-react"

import { Button } from "../components/ui/Button"
import { followupDemoRows } from "../data/followupDemo"

export type PluginUiSlotName =
  | "workspace.nav"
  | "workspace.route"
  | "record.header"
  | "record.sidebar"
  | "command.palette"
  | "command.composer"
  | "agent.responseCard"

export type PluginUiContribution = {
  pluginId: string
  id: string
  slot: PluginUiSlotName
  label?: string
  description?: string
  icon?: string
  route?: string
  commandId?: string
  recordTypes?: string[]
  requires?: string[]
}

export type ResponseCardContext = {
  dismissedIds: string[]
  onDismiss(id: string): void
}

export type PluginUiRegistryEntry = {
  navItem?: ComponentType<{ contribution: PluginUiContribution }>
  routeComponent?: ComponentType
  responseCard?: ComponentType<{ contribution: PluginUiContribution; context: ResponseCardContext }>
}

export type RenderablePluginUi = {
  contribution: PluginUiContribution
  registry: PluginUiRegistryEntry
}

export const enabledPluginUiSlots: PluginUiContribution[] = [
  {
    pluginId: "bare.followups",
    id: "followups-nav",
    slot: "workspace.nav",
    label: "Stalled follow-ups",
    icon: "Mail",
    route: "/follow-ups",
    commandId: "followups.stalled_deals",
    requires: ["plugin:ui"],
  },
  {
    pluginId: "bare.followups",
    id: "followups-route",
    slot: "workspace.route",
    label: "Stalled follow-ups",
    route: "/follow-ups",
    commandId: "followups.stalled_deals",
    requires: ["plugin:ui"],
  },
  {
    pluginId: "bare.followups",
    id: "followups-response-card",
    slot: "agent.responseCard",
    label: "Follow-ups for stalled deals",
    commandId: "followups.stalled_deals",
    recordTypes: ["deal", "company", "person"],
    requires: ["plugin:ui"],
  },
]

export const pluginUiRegistry: Record<string, PluginUiRegistryEntry> = {
  "bare.followups:followups-nav": {
    navItem: FollowUpsNavItem,
  },
  "bare.followups:followups-route": {
    routeComponent: FollowUpsRoute,
  },
  "bare.followups:followups-response-card": {
    responseCard: FollowUpsResponseCard,
  },
}

export function getRenderablePluginUi(
  slot: PluginUiSlotName,
  contributions = enabledPluginUiSlots,
): RenderablePluginUi[] {
  return contributions
    .filter((contribution) => contribution.slot === slot)
    .flatMap((contribution) => {
      const registry = pluginUiRegistry[registryKey(contribution)]
      if (!registry) {
        console.warn(`Missing trusted plugin UI registry entry: ${registryKey(contribution)}`)
        return []
      }
      return [{ contribution, registry }]
    })
}

function registryKey(contribution: Pick<PluginUiContribution, "pluginId" | "id">): string {
  return `${contribution.pluginId}:${contribution.id}`
}

function FollowUpsNavItem({ contribution }: { contribution: PluginUiContribution }) {
  return (
    <NavLink
      to={contribution.route ?? "/"}
      className={({ isActive }) => `nav-item plugin-nav-item ${isActive ? "active" : ""}`}
    >
      <span className="nav-icon">
        <Mail size={17} />
      </span>
      <span className="nav-label">{contribution.label}</span>
    </NavLink>
  )
}

function FollowUpsRoute() {
  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Plugin route</p>
          <h1>Stalled follow-ups</h1>
          <p className="muted">Trusted first-party route registered from a plugin UI slot.</p>
        </div>
      </div>
      <FollowUpsResponseCard
        contribution={enabledPluginUiSlots[2]}
        context={{ dismissedIds: [], onDismiss: () => undefined }}
      />
    </section>
  )
}

function FollowUpsResponseCard(
  { contribution, context }: { contribution: PluginUiContribution; context: ResponseCardContext },
) {
  const visibleDrafts = followupDemoRows.filter((draft) => !context.dismissedIds.includes(draft.id))

  return (
    <section className="followup-card" aria-label={contribution.label}>
      <div className="followup-card-header">
        <div>
          <Mail size={17} />
          <strong>{contribution.label}</strong>
        </div>
        <span>{visibleDrafts.length} ready</span>
      </div>

      <div className="followup-list">
        {visibleDrafts.map((draft) => (
          <article className="followup-row" key={draft.id}>
            <Mail size={16} />
            <div className="followup-main">
              <strong>{draft.subject}</strong>
              <span>{draft.preview}</span>
              <small>{draft.rationale}</small>
            </div>
            <div className="followup-recipient">
              <span className="person-dot">{draft.recipient.slice(0, 1)}</span>
              <span>{draft.recipient}</span>
              <small>{draft.account}</small>
            </div>
            <IconButton
              label={`Dismiss ${draft.subject}`}
              title="Dismiss draft"
              onClick={() => context.onDismiss(draft.id)}
            >
              <X size={15} />
            </IconButton>
            <IconButton label={`Review ${draft.subject}`} title="Review draft">
              <Send size={15} />
            </IconButton>
          </article>
        ))}
      </div>

      <div className="followup-footer">
        <button type="button">Dismiss all</button>
        <Button variant="secondary" disabled={visibleDrafts.length === 0}>
          Send all {visibleDrafts.length}
        </Button>
      </div>
    </section>
  )
}

function IconButton(props: {
  label: string
  title: string
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={props.label}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
