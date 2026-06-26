import { useOne } from "@refinedev/core"
import { useParams } from "react-router"
import { CalendarPlus, Mail, MessageSquareText, Phone, Plus } from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"
import type { CrmRecord } from "../types/crm"

export function ContactShowPage() {
  const { id = "" } = useParams()
  const { result } = useOne<CrmRecord>({ resource: "contacts", id })
  const contact = result

  return (
    <section className="page-stack">
      <div className="record-header">
        <div className="record-avatar">{initials(contact?.title ?? "Contact")}</div>
        <div>
          <p className="eyebrow">Contact</p>
          <h1>{contact?.title ?? "Contact"}</h1>
          <p className="muted">{contact?.subtitle ?? "CRM profile"}</p>
          <div className="badge-row">
            {contact?.badges?.map((badge) => <Badge key={badge}>{badge}</Badge>)}
          </div>
        </div>
        <div className="record-actions">
          <Button>
            <Phone size={16} />Call
          </Button>
          <Button>
            <Mail size={16} />Email
          </Button>
          <Button variant="primary">
            <Plus size={16} />Task
          </Button>
        </div>
      </div>

      <div className="record-grid">
        <section className="panel">
          <div className="tabs">
            <button className="active">Overview</button>
            <button>Activity</button>
            <button>Emails</button>
            <button>Deals</button>
            <button>Files</button>
          </div>

          <div className="detail-grid">
            <Detail label="Email" value={contact?.email} />
            <Detail label="Phone" value={contact?.phone} />
            <Detail label="Company" value={contact?.company} />
            <Detail label="Owner" value={contact?.owner} />
            <Detail label="Stage" value={contact?.stage} />
            <Detail
              label="Confidence"
              value={contact?.confidence ? `${contact.confidence}%` : undefined}
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Activity timeline</h2>
              <p>Calls, notes, tasks, meetings, and email events.</p>
            </div>
          </div>
          <div className="timeline">
            {[
              ["Email opened", "Security checklist and pilot timeline"],
              ["Note added", "Procurement requires updated DPA"],
              ["Task created", "Send revised DPA by Friday"],
              ["Meeting scheduled", "Pilot kickoff"],
            ].map(([title, subtitle], index) => (
              <div className="timeline-item" key={title}>
                {index % 2 === 0 ? <Mail size={16} /> : <MessageSquareText size={16} />}
                <div>
                  <strong>{title}</strong>
                  <span>{subtitle}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="composer">
            <input placeholder="Add an internal note..." />
            <Button>
              <CalendarPlus size={16} />Log
            </Button>
          </div>
        </section>
      </div>
    </section>
  )
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value ?? "Not set"}</strong>
    </div>
  )
}

function initials(value: string) {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}
