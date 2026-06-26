export type CrmResource =
  | "contacts"
  | "companies"
  | "deals"
  | "tasks"
  | "activities"
  | "inbox"
  | "workflow-templates"
  | "installed-workflows"
  | "workflow-runs"

export type CrmRecord = {
  id: string
  type: "person" | "company" | "deal" | "task" | "activity" | "note" | "collection"
  title: string
  subtitle?: string
  eyebrow?: string
  badges?: string[]
  updatedAt?: string
  archived?: boolean
  owner?: string
  stage?: string
  value?: string
  nextStep?: string
  email?: string
  phone?: string
  company?: string
  confidence?: number
}

export type InboxThread = {
  id: string
  from: string
  subject: string
  preview: string
  receivedAt: string
  unread?: boolean
  contactId?: string
  company?: string
  deal?: string
  labels: string[]
}

export type WorkflowTrigger = {
  event: string
  label: string
}

export type WorkflowCondition = {
  field: string
  operator: "equals" | "contains" | "greaterThan" | "exists"
  value?: string | number | boolean
}

export type WorkflowAction = {
  type: string
  label: string
  config: Record<string, string | number | boolean>
}

export type WorkflowSetting = {
  type: "string" | "number" | "boolean" | "select"
  label: string
  default: string | number | boolean
  options?: string[]
}

// Lab-only shape for UI exploration. Do not treat this as the canonical workflow contract.
export type LabWorkflowManifest = {
  id: string
  name: string
  type: "template" | "plugin"
  version: string
  description: string
  requires: string[]
  contributes: {
    workflows: Array<{
      id: string
      name: string
      listensTo: string[]
      writes: string[]
    }>
  }
  template: {
    trigger: WorkflowTrigger
    conditions: WorkflowCondition[]
    actions: WorkflowAction[]
  }
  settingsSchema: Record<string, WorkflowSetting>
}

export type WorkflowTemplate = {
  id: string
  name: string
  category: "Sales" | "Email" | "Operations" | "Data"
  summary: string
  author: string
  version: string
  installs: number
  status: "built-in" | "uploaded" | "marketplace"
  manifest: LabWorkflowManifest
}

export type InstalledWorkflow = {
  id: string
  templateId: string
  name: string
  enabled: boolean
  owner: string
  version: string
  lastRunAt: string
  lastRunStatus: "success" | "warning" | "failed" | "never"
  settings: Record<string, string | number | boolean>
}

export type WorkflowRun = {
  id: string
  workflowId: string
  workflowName: string
  event: string
  status: "success" | "warning" | "failed"
  startedAt: string
  durationMs: number
  message: string
}
