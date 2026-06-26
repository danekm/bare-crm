import type {
  CrmRecord,
  InboxThread,
  InstalledWorkflow,
  WorkflowRun,
  WorkflowTemplate,
} from "../types/crm"

export const people: CrmRecord[] = [
  {
    id: "person_ada",
    type: "person",
    title: "Ada Lovelace",
    subtitle: "CTO at Analytical Engines",
    eyebrow: "person",
    email: "ada@example.com",
    phone: "+1 415 555 0101",
    company: "Analytical Engines",
    owner: "Dan",
    stage: "Evaluation",
    confidence: 86,
    badges: ["technical buyer", "gmail", "priority"],
    updatedAt: "2026-06-10T17:22:00Z",
  },
  {
    id: "person_grace",
    type: "person",
    title: "Grace Hopper",
    subtitle: "VP Engineering at Compiler Co",
    eyebrow: "person",
    email: "grace@example.com",
    company: "Compiler Co",
    owner: "Sam",
    stage: "Active",
    confidence: 72,
    badges: ["champion", "renewal"],
    updatedAt: "2026-06-09T15:11:00Z",
  },
  {
    id: "person_katherine",
    type: "person",
    title: "Katherine Johnson",
    subtitle: "Operations Lead at Orbital Systems",
    eyebrow: "person",
    email: "katherine@example.com",
    company: "Orbital Systems",
    owner: "Mira",
    stage: "New",
    confidence: 58,
    badges: ["inbound", "needs follow-up"],
    updatedAt: "2026-06-08T10:45:00Z",
  },
]

export const companies: CrmRecord[] = [
  {
    id: "company_analytical",
    type: "company",
    title: "Analytical Engines",
    subtitle: "AI infrastructure, 240 employees",
    eyebrow: "company",
    owner: "Dan",
    stage: "Expansion",
    value: "$84k",
    badges: ["target account", "security review"],
    updatedAt: "2026-06-10T18:05:00Z",
  },
  {
    id: "company_compiler",
    type: "company",
    title: "Compiler Co",
    subtitle: "Developer tools, 90 employees",
    eyebrow: "company",
    owner: "Sam",
    stage: "Renewal",
    value: "$36k",
    badges: ["active customer"],
    updatedAt: "2026-06-09T16:30:00Z",
  },
]

export const deals: CrmRecord[] = [
  {
    id: "deal_analytical_pilot",
    type: "deal",
    title: "Analytical Engines pilot",
    subtitle: "Procurement review due Friday",
    eyebrow: "deal",
    owner: "Dan",
    stage: "Proposal",
    value: "$42k",
    nextStep: "Send revised DPA",
    confidence: 68,
    badges: ["legal", "gmail-linked"],
    updatedAt: "2026-06-11T09:14:00Z",
  },
  {
    id: "deal_compiler_expansion",
    type: "deal",
    title: "Compiler Co expansion",
    subtitle: "Champion requested 20 more seats",
    eyebrow: "deal",
    owner: "Sam",
    stage: "Negotiation",
    value: "$24k",
    nextStep: "Confirm success plan",
    confidence: 74,
    badges: ["expansion", "warm"],
    updatedAt: "2026-06-10T12:04:00Z",
  },
  {
    id: "deal_orbital_intro",
    type: "deal",
    title: "Orbital Systems intro",
    subtitle: "Discovery scheduled",
    eyebrow: "deal",
    owner: "Mira",
    stage: "Discovery",
    value: "$18k",
    nextStep: "Prepare use-case notes",
    confidence: 41,
    badges: ["new"],
    updatedAt: "2026-06-08T12:00:00Z",
  },
]

export const tasks: CrmRecord[] = [
  {
    id: "task_dpa",
    type: "task",
    title: "Send revised DPA",
    subtitle: "Analytical Engines",
    eyebrow: "task",
    owner: "Dan",
    stage: "Today",
    badges: ["legal"],
    updatedAt: "2026-06-11T08:10:00Z",
  },
  {
    id: "task_follow_up",
    type: "task",
    title: "Follow up on Gmail import",
    subtitle: "Katherine Johnson",
    eyebrow: "task",
    owner: "Mira",
    stage: "Tomorrow",
    badges: ["email"],
    updatedAt: "2026-06-10T19:00:00Z",
  },
]

export const inboxThreads: InboxThread[] = [
  {
    id: "thread_1",
    from: "Ada Lovelace",
    subject: "Security checklist and pilot timeline",
    preview:
      "Looping in procurement. Could you send the revised DPA and current subprocessors list?",
    receivedAt: "09:42",
    unread: true,
    contactId: "person_ada",
    company: "Analytical Engines",
    deal: "Analytical Engines pilot",
    labels: ["deal", "legal"],
  },
  {
    id: "thread_2",
    from: "Grace Hopper",
    subject: "Expansion seats",
    preview: "The team is ready to add the next group. Let's align on the rollout plan.",
    receivedAt: "Yesterday",
    contactId: "person_grace",
    company: "Compiler Co",
    deal: "Compiler Co expansion",
    labels: ["expansion"],
  },
  {
    id: "thread_3",
    from: "Katherine Johnson",
    subject: "Re: intro call",
    preview: "Thursday works. It would be useful to focus on import/export and audit history.",
    receivedAt: "Mon",
    contactId: "person_katherine",
    company: "Orbital Systems",
    deal: "Orbital Systems intro",
    labels: ["inbound"],
  },
]

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "tmpl_meeting_follow_up",
    name: "Meeting follow-up",
    category: "Sales",
    summary: "Create a follow-up task after a meeting is logged against an active deal.",
    author: "Bare CRM",
    version: "1.0.0",
    installs: 42,
    status: "built-in",
    manifest: {
      id: "bare.templates.meeting-follow-up",
      name: "Meeting follow-up",
      type: "template",
      version: "1.0.0",
      description: "Create a follow-up task after a meeting activity is committed.",
      requires: ["crm:read:activity.list", "crm:read:deal.get", "crm:write:task.create"],
      contributes: {
        workflows: [
          {
            id: "meeting-follow-up",
            name: "Meeting follow-up",
            listensTo: ["activity.created"],
            writes: ["task.create"],
          },
        ],
      },
      template: {
        trigger: {
          event: "activity.created",
          label: "Activity created",
        },
        conditions: [
          {
            field: "activity.type",
            operator: "equals",
            value: "meeting",
          },
          {
            field: "deal.stage",
            operator: "exists",
          },
        ],
        actions: [
          {
            type: "task.create",
            label: "Create follow-up task",
            config: {
              title: "Follow up with {{contact.name}}",
              dueInDays: 2,
              assignToOwner: true,
            },
          },
        ],
      },
      settingsSchema: {
        dueInDays: {
          type: "number",
          label: "Follow-up delay",
          default: 2,
        },
        taskTitle: {
          type: "string",
          label: "Task title",
          default: "Follow up with {{contact.name}}",
        },
      },
    },
  },
  {
    id: "tmpl_stale_deal",
    name: "Stale deal reminder",
    category: "Operations",
    summary: "Alert the deal owner when an opportunity has no activity for a configurable period.",
    author: "Bare CRM",
    version: "0.9.0",
    installs: 28,
    status: "marketplace",
    manifest: {
      id: "bare.templates.stale-deal-reminder",
      name: "Stale deal reminder",
      type: "template",
      version: "0.9.0",
      description: "Detect stale deals and create a reminder task for the owner.",
      requires: ["crm:read:deal.list", "crm:read:activity.list", "crm:write:task.create"],
      contributes: {
        workflows: [
          {
            id: "stale-deal-reminder",
            name: "Stale deal reminder",
            listensTo: ["schedule.daily"],
            writes: ["task.create"],
          },
        ],
      },
      template: {
        trigger: {
          event: "schedule.daily",
          label: "Daily schedule",
        },
        conditions: [
          {
            field: "deal.daysSinceActivity",
            operator: "greaterThan",
            value: 10,
          },
        ],
        actions: [
          {
            type: "task.create",
            label: "Create owner reminder",
            config: {
              title: "Revive {{deal.title}}",
              dueInDays: 1,
              assignToOwner: true,
            },
          },
        ],
      },
      settingsSchema: {
        daysWithoutActivity: {
          type: "number",
          label: "Days without activity",
          default: 10,
        },
        includeNegotiation: {
          type: "boolean",
          label: "Include negotiation deals",
          default: true,
        },
      },
    },
  },
  {
    id: "tmpl_email_draft",
    name: "Draft reply from inbox signal",
    category: "Email",
    summary: "When a linked thread needs a reply, prepare a CRM-aware draft without sending it.",
    author: "Gmail workflow pack",
    version: "0.3.0",
    installs: 17,
    status: "uploaded",
    manifest: {
      id: "bare.templates.gmail-draft-reply",
      name: "Draft reply from inbox signal",
      type: "plugin",
      version: "0.3.0",
      description: "Create a draft reply for CRM-linked Gmail threads that need follow-up.",
      requires: [
        "crm:read:contact.get",
        "crm:read:deal.get",
        "crm:write:note.create",
        "gmail:draft.create",
      ],
      contributes: {
        workflows: [
          {
            id: "gmail-draft-reply",
            name: "Draft reply from inbox signal",
            listensTo: ["inbox.thread.flagged"],
            writes: ["note.create", "gmail.draft.create"],
          },
        ],
      },
      template: {
        trigger: {
          event: "inbox.thread.flagged",
          label: "Inbox thread flagged",
        },
        conditions: [
          {
            field: "thread.label",
            operator: "contains",
            value: "needs-follow-up",
          },
        ],
        actions: [
          {
            type: "gmail.draft.create",
            label: "Prepare draft reply",
            config: {
              tone: "concise",
              includeDealContext: true,
            },
          },
          {
            type: "note.create",
            label: "Log draft note",
            config: {
              title: "Draft prepared for {{thread.subject}}",
              private: false,
            },
          },
        ],
      },
      settingsSchema: {
        tone: {
          type: "select",
          label: "Draft tone",
          default: "concise",
          options: ["concise", "warm", "formal"],
        },
        requireApproval: {
          type: "boolean",
          label: "Require approval before send",
          default: true,
        },
      },
    },
  },
]

export const installedWorkflows: InstalledWorkflow[] = [
  {
    id: "installed_meeting_follow_up",
    templateId: "tmpl_meeting_follow_up",
    name: "Meeting follow-up",
    enabled: true,
    owner: "Dan",
    version: "1.0.0",
    lastRunAt: "2026-06-11T18:32:00Z",
    lastRunStatus: "success",
    settings: {
      dueInDays: 2,
      taskTitle: "Follow up with {{contact.name}}",
    },
  },
  {
    id: "installed_stale_deal",
    templateId: "tmpl_stale_deal",
    name: "Stale deal reminder",
    enabled: false,
    owner: "Mira",
    version: "0.9.0",
    lastRunAt: "2026-06-10T09:00:00Z",
    lastRunStatus: "warning",
    settings: {
      daysWithoutActivity: 10,
      includeNegotiation: true,
    },
  },
]

export const workflowRuns: WorkflowRun[] = [
  {
    id: "run_1",
    workflowId: "installed_meeting_follow_up",
    workflowName: "Meeting follow-up",
    event: "activity.created",
    status: "success",
    startedAt: "2026-06-11T18:32:00Z",
    durationMs: 184,
    message: "Created task for Analytical Engines pilot.",
  },
  {
    id: "run_2",
    workflowId: "installed_stale_deal",
    workflowName: "Stale deal reminder",
    event: "schedule.daily",
    status: "warning",
    startedAt: "2026-06-10T09:00:00Z",
    durationMs: 421,
    message: "Skipped 2 deals because owners were missing.",
  },
  {
    id: "run_3",
    workflowId: "installed_meeting_follow_up",
    workflowName: "Meeting follow-up",
    event: "activity.created",
    status: "success",
    startedAt: "2026-06-09T21:15:00Z",
    durationMs: 153,
    message: "Created task for Compiler Co expansion.",
  },
]

export const mockByResource = {
  contacts: people,
  companies,
  deals,
  tasks,
  activities: [...tasks, ...deals],
  inbox: inboxThreads,
  "workflow-templates": workflowTemplates,
  "installed-workflows": installedWorkflows,
  "workflow-runs": workflowRuns,
}
