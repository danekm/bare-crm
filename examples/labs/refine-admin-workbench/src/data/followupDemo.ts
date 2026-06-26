export type FollowupDemoRow = {
  id: string
  subject: string
  preview: string
  recipient: string
  account: string
  rationale: string
}

export const followupDemoRows: FollowupDemoRow[] = [
  {
    id: "beacon-demo",
    subject: "RE: Beacon Demo",
    preview: "Following up on the search workflow we mapped after your demo.",
    recipient: "David Park",
    account: "Beacon",
    rationale: "Demo interest, no reply in 18 days",
  },
  {
    id: "sso-requirements",
    subject: "RE: SSO Requirements",
    preview: "Quick note on the SSO requirements you mentioned in procurement review.",
    recipient: "Marcus Webb",
    account: "Northstar",
    rationale: "Security review stalled after requirements thread",
  },
  {
    id: "q1-rollout",
    subject: "RE: Q1 Rollout",
    preview: "Checking in on your Q1 rollout timeline and the pilot success criteria.",
    recipient: "James Liu +2 others",
    account: "Atlas Labs",
    rationale: "Champion engaged, opportunity quiet for 24 days",
  },
  {
    id: "confluence-migration",
    subject: "RE: Confluence Migration",
    preview: "Still thinking about the Confluence migration plan we discussed.",
    recipient: "Rachel Kim +2 others",
    account: "Meridian",
    rationale: "Migration pain identified in discovery call",
  },
  {
    id: "procurement-review",
    subject: "RE: Procurement Review",
    preview: "Add a contact before sending a follow-up for the procurement review.",
    recipient: "Unknown contact",
    account: "HelioWorks",
    rationale: "Stale deal has account context but no linked person",
  },
]

export const followupDemoSignals = [
  { id: "stale-demo", label: "Stale demo interest", ageDays: 18 },
  { id: "stale-security", label: "Stale security review", ageDays: 21 },
  { id: "recent-demo", label: "Recent demo", ageDays: 1 },
]
