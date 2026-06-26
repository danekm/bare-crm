import { useList } from "@refinedev/core"
import { ArrowRight, DollarSign } from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"
import type { CrmRecord } from "../types/crm"

export function DealsPage() {
  const { result } = useList<CrmRecord>({ resource: "deals" })
  const deals = result.data ?? []

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Revenue</p>
          <h1>Deals</h1>
          <p className="muted">A board-first view that can still use Refine resource actions.</p>
        </div>
        <Button variant="primary">New deal</Button>
      </div>

      <div className="board">
        {["Discovery", "Proposal", "Negotiation"].map((stage) => (
          <section className="board-column" key={stage}>
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
                <article className="deal-card deal-card-large" key={deal.id}>
                  <div className="deal-card-top">
                    <strong>{deal.title}</strong>
                    <Badge tone="blue">{deal.value}</Badge>
                  </div>
                  <span>{deal.subtitle}</span>
                  <div className="progress">
                    <span style={{ width: `${deal.confidence ?? 0}%` }} />
                  </div>
                  <div className="deal-meta">
                    <span>
                      <DollarSign size={14} />
                      {deal.owner}
                    </span>
                    <span>{deal.confidence}%</span>
                  </div>
                  <div className="next-step">
                    <span>{deal.nextStep}</span>
                    <ArrowRight size={15} />
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
    </section>
  )
}
