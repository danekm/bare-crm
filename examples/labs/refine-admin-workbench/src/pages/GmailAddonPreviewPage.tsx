import { useState } from "react"
import {
  Archive,
  CalendarClock,
  Check,
  Database,
  MailCheck,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  Reply,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
} from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"

type AddonAction = {
  label: string
  tone: "primary" | "secondary" | "destructive"
  icon: JSX.Element
}

type AddonRow = {
  label: string
  value: string
}

type LookupStatus = "person_found" | "company_found" | "new_person"

type GmailConversationPreview = {
  id: string
  from: string
  email: string
  subject: string
  preview: string
  receivedAt: string
  bucket: "promote" | "suggest" | "ignore"
  confidence: number
  signals: string[]
  lookupStatus: LookupStatus
  personRows: AddonRow[]
  context: AddonRow[]
  timeline: AddonRow[]
}

const conversations: GmailConversationPreview[] = [
  {
    id: "ada-security",
    from: "Ada Lovelace",
    email: "ada@analytical.example",
    subject: "Security checklist and pilot timeline",
    preview:
      "Looping in procurement. Could you send the revised DPA and current subprocessors list?",
    receivedAt: "09:42",
    bucket: "promote",
    confidence: 0.91,
    signals: ["known contact", "open deal", "security review"],
    lookupStatus: "person_found",
    personRows: [
      { label: "Person", value: "Ada Lovelace - existing contact" },
      { label: "Email match", value: "ada@analytical.example" },
      { label: "Role", value: "Technical buyer" },
      { label: "Owner", value: "Dan" },
    ],
    context: [
      { label: "Analytical Engines", value: "Company - active customer" },
      { label: "Analytical Engines pilot", value: "Deal - Proposal - $48k" },
    ],
    timeline: [
      { label: "Security review opened", value: "Today 09:42 - Gmail thread linked" },
      { label: "Pilot proposal sent", value: "Yesterday 16:10 - Dan" },
      { label: "Discovery call", value: "Jun 12 - notes captured" },
    ],
  },
  {
    id: "grace-rollout",
    from: "Grace Hopper",
    email: "grace@compiler.example",
    subject: "Expansion seats",
    preview: "The team is ready to add the next group. Let's align on the rollout plan.",
    receivedAt: "Yesterday",
    bucket: "suggest",
    confidence: 0.78,
    signals: ["saved company", "customer domain", "expansion language"],
    lookupStatus: "person_found",
    personRows: [
      { label: "Person", value: "Grace Hopper - existing contact" },
      { label: "Email match", value: "grace@compiler.example" },
      { label: "Role", value: "Champion" },
      { label: "Owner", value: "Maya" },
    ],
    context: [
      { label: "Compiler Co", value: "Company - saved customer" },
      { label: "Deal match", value: "No active deal linked to this thread" },
    ],
    timeline: [
      { label: "Renewal note", value: "Jun 10 - customer success" },
      { label: "Seat expansion discussed", value: "May 28 - call summary" },
    ],
  },
  {
    id: "mira-intro",
    from: "Mira Chen",
    email: "mira@northstar.example",
    subject: "Intro and procurement question",
    preview: "We are evaluating CRM infrastructure and wanted to ask about audit history.",
    receivedAt: "Mon",
    bucket: "suggest",
    confidence: 0.64,
    signals: ["external sender", "buying intent", "no saved record"],
    lookupStatus: "new_person",
    personRows: [
      { label: "Person", value: "No person found for mira@northstar.example" },
      { label: "Auto-add", value: "Ready to create Mira Chen as a new person" },
      { label: "Source", value: "Gmail sender metadata" },
    ],
    context: [],
    timeline: [],
  },
]

const actions: AddonAction[] = [
  { label: "Save", tone: "primary", icon: <Check size={15} /> },
  { label: "Attach", tone: "secondary", icon: <Paperclip size={15} /> },
  { label: "Create lead", tone: "secondary", icon: <UserPlus size={15} /> },
  { label: "Follow up", tone: "secondary", icon: <CalendarClock size={15} /> },
  { label: "Ignore sender", tone: "destructive", icon: <Archive size={15} /> },
  { label: "Not relevant", tone: "secondary", icon: <MoreVertical size={15} /> },
]

export function GmailAddonPreviewPage() {
  const [selectedConversationId, setSelectedConversationId] = useState(conversations[0].id)
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ??
      conversations[0]
  const initials = initialsFor(selectedConversation.from)
  const messageRows: AddonRow[] = [
    {
      label: "From",
      value: `${selectedConversation.from} <${selectedConversation.email}>`,
    },
    {
      label: "Meaning",
      value: `${selectedConversation.bucket} (${
        Math.round(selectedConversation.confidence * 100)
      }%): ${selectedConversation.signals.join(", ")}`,
    },
  ]
  const contextRows = selectedConversation.context.length > 0
    ? selectedConversation.context
    : [{ label: "Company/deal", value: "No matching company or deal found yet." }]
  const timelineRows = selectedConversation.timeline.length > 0
    ? selectedConversation.timeline
    : [{ label: "No Bare timeline yet", value: "This conversation has not been saved to CRM." }]
  const lookupCopy = lookupStatusCopy(selectedConversation.lookupStatus)

  return (
    <section className="gmail-preview-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Google Workspace add-on</p>
          <h1>Gmail add-on preview</h1>
          <p className="muted">
            Visual preview of the contextual sidebar card that appears for each opened Gmail
            conversation, whether Bare already knows the sender or not.
          </p>
        </div>
        <div className="header-actions">
          <Button>
            <MessageSquarePlus size={16} />
            Test action
          </Button>
          <Button variant="primary">
            <MailCheck size={16} />
            Open sample
          </Button>
        </div>
      </div>

      <div className="gmail-preview-layout">
        <section className="gmail-window panel" aria-label="Gmail message preview">
          <header className="gmail-toolbar">
            <span className="gmail-wordmark">Gmail</span>
            <div className="gmail-search">Search mail</div>
            <span className="gmail-avatar">DC</span>
          </header>

          <div className="gmail-message-shell">
            <aside className="gmail-folders">
              {["Inbox", "Starred", "Snoozed", "Sent", "Drafts"].map((folder, index) => (
                <span className={index === 0 ? "active" : ""} key={folder}>
                  {folder}
                </span>
              ))}
            </aside>

            <div className="gmail-conversation-space">
              <div className="gmail-thread-list" aria-label="Gmail conversations">
                {conversations.map((conversation) => (
                  <button
                    className={`gmail-thread-row ${
                      conversation.id === selectedConversation.id ? "selected" : ""
                    }`}
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    type="button"
                  >
                    <span>{conversation.from}</span>
                    <strong>{conversation.subject}</strong>
                    <small>{conversation.preview}</small>
                    <Badge tone={conversation.context.length > 0 ? "blue" : "amber"}>
                      {conversation.lookupStatus === "new_person" ? "new person" : "person found"}
                    </Badge>
                  </button>
                ))}
              </div>

              <article className="gmail-message">
                <div className="gmail-message-actions">
                  <Archive size={16} />
                  <Reply size={16} />
                  <MoreVertical size={16} />
                </div>
                <h2>{selectedConversation.subject}</h2>
                <div className="gmail-sender-line">
                  <span className="gmail-sender-avatar">{initials}</span>
                  <div>
                    <strong>{selectedConversation.from}</strong>
                    <span>{selectedConversation.email} to you</span>
                  </div>
                </div>
                <p>
                  {selectedConversation.preview}{" "}
                  The Bare add-on is visible because this is the currently opened Gmail
                  conversation, not because the record is already saved.
                </p>
              </article>
            </div>
          </div>
        </section>

        <aside className="workspace-addon-frame" aria-label="Bare Gmail add-on card preview">
          <div className="addon-topbar">
            <span className="addon-logo">B</span>
            <div>
              <strong>Bare</strong>
              <span>{selectedConversation.subject}</span>
            </div>
          </div>

          <section className="addon-card">
            <section className={`addon-lookup addon-lookup-${selectedConversation.lookupStatus}`}>
              <span className="addon-lookup-icon">
                {selectedConversation.lookupStatus === "new_person"
                  ? <UserPlus size={17} />
                  : <UserCheck size={17} />}
              </span>
              <div>
                <strong>{lookupCopy.title}</strong>
                <p>{lookupCopy.detail}</p>
              </div>
            </section>
            <AddonSection title="Message" rows={messageRows} />
            <AddonSection title="Person lookup" rows={selectedConversation.personRows} />
            <AddonSection title="CRM context" rows={contextRows} />
            <AddonSection title="Recent timeline" rows={timelineRows} />

            <section className="addon-section">
              <h3>Actions</h3>
              <div className="addon-actions">
                {actions.map((action) => (
                  <button className={`addon-action addon-action-${action.tone}`} key={action.label}>
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
              {selectedConversation.lookupStatus === "new_person" && (
                <button className="addon-action addon-action-wide addon-action-primary">
                  <UserPlus size={15} />
                  <span>Add person + save thread</span>
                </button>
              )}
            </section>
          </section>

          <div className="addon-safety">
            <Database size={16} />
            <span>
              Scans Bare by email, external refs, company domain, and recent thread links.
            </span>
          </div>
        </aside>
      </div>

      <section className="gmail-preview-notes">
        <article className="panel">
          <Sparkles size={18} />
          <div>
            <strong>What this preview represents</strong>
            <p>
              The Workspace card is scoped to the active Gmail conversation. It first scans Bare for
              the sender, then shows the person record or the auto-add state.
            </p>
          </div>
        </article>
        <article className="panel">
          <ShieldCheck size={18} />
          <div>
            <strong>What still needs deployment</strong>
            <p>
              OAuth, Pub/Sub, encrypted secrets, and the deployed Google Workspace add-on endpoint
              are still separate production pieces.
            </p>
          </div>
        </article>
      </section>
    </section>
  )
}

function lookupStatusCopy(status: LookupStatus): { title: string; detail: string } {
  if (status === "person_found") {
    return {
      title: "Person found in Bare",
      detail: "The add-on matched this sender to an existing person and loaded CRM context.",
    }
  }
  if (status === "company_found") {
    return {
      title: "Company found, person missing",
      detail: "The domain matches a saved company. Bare can add the sender under that company.",
    }
  }
  return {
    title: "Person not found",
    detail: "Bare can automatically create this person from Gmail sender metadata.",
  }
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function AddonSection({ title, rows }: { title: string; rows: AddonRow[] }) {
  return (
    <section className="addon-section">
      <h3>{title}</h3>
      <div className="addon-rows">
        {rows.map((row) => (
          <div className="addon-row" key={`${row.label}-${row.value}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
