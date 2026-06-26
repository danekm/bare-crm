import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useList } from "@refinedev/core"
import {
  CheckCircle2,
  Clock3,
  Download,
  FileJson,
  History,
  Play,
  Power,
  ShieldCheck,
  Store,
  Upload,
  Workflow,
} from "lucide-react"

import { Badge } from "../components/ui/Badge"
import { Button } from "../components/ui/Button"
import type { InstalledWorkflow, WorkflowRun, WorkflowTemplate } from "../types/crm"

type WorkflowTab = "marketplace" | "installed" | "runs"

export function WorkflowsPage() {
  const { result: templateResult } = useList<WorkflowTemplate>({ resource: "workflow-templates" })
  const { result: installedResult } = useList<InstalledWorkflow>({
    resource: "installed-workflows",
  })
  const { result: runResult } = useList<WorkflowRun>({ resource: "workflow-runs" })

  const templates = templateResult.data ?? []
  const runs = runResult.data ?? []
  const [activeTab, setActiveTab] = useState<WorkflowTab>("marketplace")
  const [selectedTemplateId, setSelectedTemplateId] = useState("tmpl_meeting_follow_up")
  const [installed, setInstalled] = useState<InstalledWorkflow[]>([])

  useEffect(() => {
    if (installed.length === 0 && installedResult.data?.length) {
      setInstalled(installedResult.data)
    }
  }, [installed.length, installedResult.data])

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ??
    templates[0]
  const installedTemplateIds = useMemo(
    () => new Set(installed.map((workflow) => workflow.templateId)),
    [installed],
  )
  const enabledCount = installed.filter((workflow) => workflow.enabled).length
  const latestRun = runs[0]

  const installSelectedTemplate = () => {
    if (!selectedTemplate || installedTemplateIds.has(selectedTemplate.id)) return

    setInstalled((current) => [
      {
        id: `installed_${selectedTemplate.id}`,
        templateId: selectedTemplate.id,
        name: selectedTemplate.name,
        enabled: true,
        owner: "Dan",
        version: selectedTemplate.version,
        lastRunAt: "Never",
        lastRunStatus: "never",
        settings: Object.fromEntries(
          Object.entries(selectedTemplate.manifest.settingsSchema).map(([key, setting]) => [
            key,
            setting.default,
          ]),
        ),
      },
      ...current,
    ])
    setActiveTab("installed")
  }

  const toggleWorkflow = (workflowId: string) => {
    setInstalled((current) =>
      current.map((workflow) =>
        workflow.id === workflowId ? { ...workflow, enabled: !workflow.enabled } : workflow
      )
    )
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Automation</p>
          <h1>Workflow marketplace</h1>
          <p className="muted">
            Install templates, inspect manifests, approve capabilities, and audit every run.
          </p>
        </div>
        <div className="header-actions">
          <Button>
            <Upload size={16} />
            Upload manifest
          </Button>
          <Button variant="primary">
            <Store size={16} />
            Browse catalog
          </Button>
        </div>
      </div>

      <div className="workflow-metrics">
        <Metric
          icon={<Store size={18} />}
          label="Catalog templates"
          value={String(templates.length)}
        />
        <Metric icon={<Workflow size={18} />} label="Installed" value={String(installed.length)} />
        <Metric icon={<Power size={18} />} label="Enabled" value={String(enabledCount)} />
        <Metric
          icon={<Clock3 size={18} />}
          label="Latest run"
          value={latestRun ? `${latestRun.durationMs}ms` : "None"}
        />
      </div>

      <div className="tabs workflow-tabs">
        {[
          ["marketplace", "Marketplace"],
          ["installed", "Installed"],
          ["runs", "Runs"],
        ].map(([key, label]) => (
          <button
            className={activeTab === key ? "active" : ""}
            key={key}
            onClick={() => setActiveTab(key as WorkflowTab)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "marketplace" && selectedTemplate && (
        <div className="workflow-layout">
          <section className="workflow-catalog">
            {templates.map((template) => (
              <button
                className={`workflow-template-card ${
                  template.id === selectedTemplate.id ? "selected" : ""
                }`}
                data-template-id={template.id}
                data-testid="workflow-template-card"
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                type="button"
              >
                <div className="workflow-template-top">
                  <span className="workflow-icon">
                    <Workflow size={18} />
                  </span>
                  <Badge tone={sourceTone(template.status)}>{template.status}</Badge>
                </div>
                <strong>{template.name}</strong>
                <p>{template.summary}</p>
                <div className="workflow-card-meta">
                  <span>{template.category}</span>
                  <span>v{template.version}</span>
                  <span>{template.installs} installs</span>
                </div>
              </button>
            ))}
          </section>

          <aside className="workflow-detail panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Selected template</p>
                <h2>{selectedTemplate.name}</h2>
                <p>{selectedTemplate.manifest.description}</p>
              </div>
              <Badge tone="blue">{selectedTemplate.category}</Badge>
            </div>

            <div className="workflow-builder">
              <Step label="Trigger" value={selectedTemplate.manifest.template.trigger.label} />
              {selectedTemplate.manifest.template.conditions.map((condition) => (
                <Step
                  key={`${condition.field}-${condition.operator}`}
                  label="Condition"
                  value={`${condition.field} ${condition.operator} ${condition.value ?? ""}`.trim()}
                />
              ))}
              {selectedTemplate.manifest.template.actions.map((action) => (
                <Step key={action.type} label="Action" value={action.label} />
              ))}
            </div>

            <section className="workflow-section">
              <h3>
                <ShieldCheck size={16} />
                Required permissions
              </h3>
              <div className="badge-row">
                {selectedTemplate.manifest.requires.map((capability) => (
                  <Badge key={capability}>{capability}</Badge>
                ))}
              </div>
            </section>

            <section className="workflow-section">
              <h3>
                <FileJson size={16} />
                Manifest preview
              </h3>
              <pre className="manifest-preview">
                {JSON.stringify(selectedTemplate.manifest, null, 2)}
              </pre>
            </section>

            <div className="workflow-actions">
              <Button>
                <Play size={16} />
                Test event
              </Button>
              <Button>
                <Download size={16} />
                Export JSON
              </Button>
              <Button
                disabled={installedTemplateIds.has(selectedTemplate.id)}
                onClick={installSelectedTemplate}
                variant="primary"
              >
                <CheckCircle2 size={16} />
                {installedTemplateIds.has(selectedTemplate.id) ? "Installed" : "Install template"}
              </Button>
            </div>
          </aside>
        </div>
      )}

      {activeTab === "installed" && (
        <section className="installed-workflows panel">
          <div className="panel-header">
            <div>
              <h2>Installed workflows</h2>
              <p>These are workspace-specific configured copies of marketplace templates.</p>
            </div>
            <Badge tone="green">{enabledCount} enabled</Badge>
          </div>
          <div className="workflow-table">
            {installed.map((workflow) => (
              <article className="workflow-row" key={workflow.id}>
                <div>
                  <strong>{workflow.name}</strong>
                  <span>Owner {workflow.owner} - version {workflow.version}</span>
                </div>
                <Badge tone={statusTone(workflow.lastRunStatus)}>{workflow.lastRunStatus}</Badge>
                <span>{workflow.lastRunAt}</span>
                <div className="workflow-settings">
                  {Object.entries(workflow.settings).map(([key, value]) => (
                    <Badge key={key}>{key}: {String(value)}</Badge>
                  ))}
                </div>
                <Button
                  onClick={() => toggleWorkflow(workflow.id)}
                  variant={workflow.enabled ? "secondary" : "primary"}
                >
                  <Power size={16} />
                  {workflow.enabled ? "Disable" : "Enable"}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "runs" && (
        <section className="workflow-runs panel">
          <div className="panel-header">
            <div>
              <h2>Run history</h2>
              <p>Every workflow execution should leave a durable, inspectable trace.</p>
            </div>
            <History size={18} />
          </div>
          <div className="run-list">
            {runs.map((run) => (
              <article className="run-row" key={run.id}>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                <div>
                  <strong>{run.workflowName}</strong>
                  <span>{run.event} - {run.message}</span>
                </div>
                <span>{run.startedAt}</span>
                <span>{run.durationMs}ms</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function Step({ label, value }: { label: string; value: string }) {
  return (
    <div className="workflow-step">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function sourceTone(status: WorkflowTemplate["status"]) {
  if (status === "built-in") return "green"
  if (status === "uploaded") return "blue"
  return "amber"
}

function statusTone(status: InstalledWorkflow["lastRunStatus"] | WorkflowRun["status"]) {
  if (status === "success") return "green"
  if (status === "warning" || status === "never") return "amber"
  return "red"
}
