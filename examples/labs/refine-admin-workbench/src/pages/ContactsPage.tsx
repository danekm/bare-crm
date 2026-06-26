import { useList, useNavigation } from "@refinedev/core"
import { Building2, Mail, MoreHorizontal, Phone, Users } from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"
import type { CrmRecord } from "../types/crm"

type ContactsPageProps = {
  mode?: "contacts" | "companies"
}

export function ContactsPage({ mode = "contacts" }: ContactsPageProps) {
  const resource = mode === "companies" ? "companies" : "contacts"
  const { result, query } = useList<CrmRecord>({ resource })
  const { show } = useNavigation()
  const records = result.data ?? []

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">{mode === "companies" ? "Accounts" : "People"}</p>
          <h1>{mode === "companies" ? "Companies" : "Contacts"}</h1>
          <p className="muted">A Refine resource list styled with local shadcn-style primitives.</p>
        </div>
        <Button variant="primary">{mode === "companies" ? "New company" : "New contact"}</Button>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <div className="segmented">
            <button className="selected">All</button>
            <button>Owned by me</button>
            <button>Needs follow-up</button>
          </div>
          <Button>Filter</Button>
        </div>

        <div className="data-table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Stage</span>
            <span>Owner</span>
            <span>Signals</span>
            <span />
          </div>
          {query.isLoading ? <div className="empty-state">Loading records...</div> : (
            records.map((record) => (
              <button
                className="table-row table-button"
                key={record.id}
                onClick={() => show(resource, record.id)}
              >
                <span className="identity-cell">
                  <span className="avatar avatar-small">
                    {mode === "companies" ? <Building2 size={15} /> : <Users size={15} />}
                  </span>
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.subtitle}</small>
                  </span>
                </span>
                <span>
                  <Badge tone={record.stage === "Active" ? "green" : "neutral"}>
                    {record.stage}
                  </Badge>
                </span>
                <span>{record.owner ?? "Unassigned"}</span>
                <span className="signal-icons">
                  {record.email && <Mail size={15} />}
                  {record.phone && <Phone size={15} />}
                  {record.badges?.slice(0, 2).map((badge) => <Badge key={badge}>{badge}</Badge>)}
                </span>
                <span className="row-action">
                  <MoreHorizontal size={17} />
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </section>
  )
}
