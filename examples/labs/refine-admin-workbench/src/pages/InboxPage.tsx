import { useList } from "@refinedev/core"
import { Archive, Clock, MailPlus, Paperclip, Reply, Search, Tag } from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"
import type { InboxThread } from "../types/crm"

export function InboxPage() {
  const { result } = useList<InboxThread>({ resource: "inbox" })
  const threads = result.data ?? []
  const selected = threads[0]

  return (
    <section className="inbox-layout">
      <aside className="mail-nav panel">
        <Button variant="primary" className="compose-button">
          <MailPlus size={16} />Compose
        </Button>
        {["Inbox", "Needs follow-up", "Sent", "Archived", "Sequences", "Shared with CRM"].map((
          item,
          index,
        ) => (
          <button className={`mail-folder ${index === 0 ? "selected" : ""}`} key={item}>
            <span>{item}</span>
            {index < 2 && <Badge>{index === 0 ? threads.length : 2}</Badge>}
          </button>
        ))}
      </aside>

      <section className="message-list panel">
        <div className="message-toolbar">
          <div className="mini-search">
            <Search size={15} />
            <input placeholder="Search mail" />
          </div>
          <Button>
            <Tag size={15} />Link
          </Button>
        </div>
        {threads.map((thread) => (
          <button
            className={`message-row ${thread.id === selected?.id ? "selected" : ""} ${
              thread.unread ? "unread" : ""
            }`}
            key={thread.id}
          >
            <div className="message-row-top">
              <strong>{thread.from}</strong>
              <span>{thread.receivedAt}</span>
            </div>
            <span>{thread.subject}</span>
            <p>{thread.preview}</p>
            <div className="badge-row">
              {thread.labels.map((label) => <Badge key={label}>{label}</Badge>)}
              <Badge tone="blue">{thread.company}</Badge>
            </div>
          </button>
        ))}
      </section>

      <article className="reading-pane panel">
        <div className="reading-toolbar">
          <div>
            <p className="eyebrow">Selected thread</p>
            <h1>{selected?.subject}</h1>
          </div>
          <div className="header-actions">
            <Button>
              <Archive size={16} />Archive
            </Button>
            <Button>
              <Clock size={16} />Snooze
            </Button>
            <Button variant="primary">
              <Reply size={16} />Reply
            </Button>
          </div>
        </div>

        <div className="email-card">
          <div className="email-header">
            <div className="avatar avatar-small">{selected?.from.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{selected?.from}</strong>
              <span>to you, linked to {selected?.deal}</span>
            </div>
            <Paperclip size={16} />
          </div>
          <p>
            {selected?.preview}{" "}
            I also added the technical buyer and procurement owner so this can be tracked against
            the pilot deal.
          </p>
        </div>

        <aside className="crm-context">
          <div>
            <p className="eyebrow">CRM context</p>
            <h2>{selected?.company}</h2>
            <span>{selected?.deal}</span>
          </div>
          <div className="context-grid">
            <Detail label="Owner" value="Dan" />
            <Detail label="Stage" value="Proposal" />
            <Detail label="Next step" value="Send revised DPA" />
            <Detail label="Thread status" value="Needs reply" />
          </div>
        </aside>

        <div className="reply-box">
          <textarea placeholder="Write a reply and log it to the CRM..." />
          <div>
            <Button>Save draft</Button>
            <Button variant="primary">Send + log</Button>
          </div>
        </div>
      </article>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
