import type { ReactNode } from "react"
import { useList } from "@refinedev/core"
import { ArrowUpRight, CheckCircle2, Clock3, Inbox, ShieldCheck } from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"
import type { CrmRecord } from "../types/crm"

type DashboardPageProps = {
  focus?: "activity"
}

export function DashboardPage({ focus }: DashboardPageProps) {
  const { result: dealData } = useList<CrmRecord>({ resource: "deals" })
  const { result: contactData } = useList<CrmRecord>({ resource: "contacts" })
  const deals = dealData.data ?? []
  const contacts = contactData.data ?? []

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">CRM workbench</p>
          <h1>{focus === "activity" ? "Activity" : "Dashboard"}</h1>
          <p className="muted">Refine resources over the Bare CRM kernel and lab dashboard API.</p>
        </div>
        <div className="header-actions">
          <Button>Import</Button>
          <Button variant="primary">Create record</Button>
        </div>
      </div>

      <div className="metric-grid">
        <Metric
          icon={<ArrowUpRight size={18} />}
          label="Open pipeline"
          value="$84k"
          detail="+12% this week"
        />
        <Metric
          icon={<Inbox size={18} />}
          label="Linked threads"
          value="18"
          detail="6 need follow-up"
        />
        <Metric icon={<Clock3 size={18} />} label="Tasks due" value="7" detail="3 due today" />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Data safety"
          value="On"
          detail="record snapshots hidden"
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel panel-large">
          <div className="panel-header">
            <div>
              <h2>Pipeline</h2>
              <p>Deals surfaced through Refine list resources.</p>
            </div>
            <Button variant="ghost">View all</Button>
          </div>
          <div className="deal-lanes">
            {["Discovery", "Proposal", "Negotiation"].map((stage) => (
              <div className="lane" key={stage}>
                <div className="lane-title">
                  <span>{stage}</span>
                  <Badge>
                    {deals.filter((deal) =>
                      deal.stage === stage
                    ).length}
                  </Badge>
                </div>
                {deals
                  .filter((deal) => deal.stage === stage)
                  .map((deal) => (
                    <article className="deal-card" key={deal.id}>
                      <strong>{deal.title}</strong>
                      <span>{deal.subtitle}</span>
                      <div className="deal-meta">
                        <Badge tone="blue">{deal.value}</Badge>
                        <span>{deal.confidence}%</span>
                      </div>
                    </article>
                  ))}
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent contacts</h2>
              <p>People and companies can share the same resource views.</p>
            </div>
          </div>
          <div className="compact-list">
            {contacts.map((contact) => (
              <div className="list-row" key={contact.id}>
                <div>
                  <strong>{contact.title}</strong>
                  <span>{contact.subtitle}</span>
                </div>
                <Badge tone={contact.stage === "Active" ? "green" : "neutral"}>
                  {contact.stage}
                </Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Follow-up queue</h2>
              <p>Email and task signals become CRM actions.</p>
            </div>
          </div>
          <div className="timeline">
            {["Send revised DPA", "Schedule discovery", "Review Gmail sync"].map((item) => (
              <div className="timeline-item" key={item}>
                <CheckCircle2 size={16} />
                <div>
                  <strong>{item}</strong>
                  <span>Owner assigned, visible in workbench</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

function Metric(props: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{props.icon}</div>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </article>
  )
}
