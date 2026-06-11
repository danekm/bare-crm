# Noros Integration

Noros is optional orchestration outside the Bare CRM kernel.

Bare CRM must work without Noros. Noros can make Bare CRM more useful for agentic workflows, repair
loops, approvals, and long-running processes, but it does not own durable CRM facts and it does not
change kernel invariants.

## Collaboration Boundary

```mermaid
flowchart TB
  User["User request"] --> Noros["Noros orchestration\noptional"]
  Noros --> MCP["MCP adapter\noptional"]
  Noros --> DirectAdapter["Other adapter\noptional"]

  MCP --> Write["Write API"]
  MCP --> Read["Read API"]
  DirectAdapter --> Write
  DirectAdapter --> Read

  Write --> Events["Event Log"]
  Read --> Facts["CRM records and relations"]
  Events --> Noros

  Noros --> Approval["Human approval checkpoint"]
  Noros --> Repair["Repair missing data"]
  Repair --> MCP

  Write --> Storage["Storage API"]
  Read --> Storage
  Noros -.forbidden.-> Storage
```

Noros may call Bare CRM through MCP or through another adapter, but all durable mutations still pass
through the Write API and all durable reads pass through the Read API.

## Ownership

Bare CRM owns:

- CRM records and relations
- Write API, Read API, Event Log, and Storage API
- stable entity identity, versions, timestamps, workspace isolation, and audit history
- structured kernel and permission failures
- optional MCP adapter semantics
- durable facts after a write commits

Noros may own:

- multi-step agent orchestration
- planning which tool to call next
- explaining policy failures to users
- proposing repair writes
- requesting and tracking human approval
- monitoring unresolved completeness issues
- scheduling long-lived business workflows above the kernel
- transient reasoning, prompts, and model-specific state

The key rule: Noros can decide what to attempt, but Bare CRM decides what actually commits.

## Required MCP Surface

The optional MCP adapter already exposes the minimum surface Noros needs.

Write tools:

- `create_person`
- `create_company`
- `create_deal`
- `create_activity`
- `create_note`
- `create_task`
- `update_record`
- `archive_record`
- `link_records`

Read and policy tools:

- `search_records`
- `get_record`
- `get_timeline`
- `list_relations`
- `list_events`
- `list_policy_issues`

Resources:

- `crm://record/{type}/{id}`
- `crm://timeline/{type}/{id}`
- `crm://search?q={query}`
- `crm://workspace/{workspaceId}/schema`
- `crm://workspace/{workspaceId}/events`

Noros should receive a trusted adapter context from the MCP server/session. It should not invent
workspace IDs, actor IDs, capabilities, or storage credentials in model-generated arguments.

## Example Flow: Search

```mermaid
sequenceDiagram
  participant User
  participant Noros
  participant MCP
  participant ReadAPI as Read API

  User->>Noros: "Find Acme"
  Noros->>MCP: search_records({ workspaceId, text: "Acme" })
  MCP->>ReadAPI: read("record.search", input, context)
  ReadAPI-->>MCP: records
  MCP-->>Noros: records
  Noros-->>User: ranked summary with record refs
```

Noros can summarize and rank results, but it should keep record refs visible so follow-up actions
are grounded in durable CRM identity.

## Example Flow: Create

```mermaid
sequenceDiagram
  participant User
  participant Noros
  participant MCP
  participant WriteAPI as Write API
  participant EventLog as Event Log

  User->>Noros: "Add Ada as a new lead"
  Noros->>MCP: create_person({ workspaceId, name, emails, source: "agent" })
  MCP->>WriteAPI: write("person.create", input, context)
  WriteAPI->>EventLog: append person.created
  WriteAPI-->>MCP: committed person
  MCP-->>Noros: person record
  Noros-->>User: confirmation with record id
```

Noros may choose the idempotency key for retried agent actions. The kernel owns idempotent write
replay.

## Example Flow: Repair

Policy and completeness checks are above the kernel. Noros can turn structured issues into a repair
loop.

```mermaid
sequenceDiagram
  participant Noros
  participant MCP
  participant Policy as Policy layer
  participant WriteAPI as Write API

  Noros->>MCP: list_policy_issues({ workspaceId, ref: deal })
  MCP->>Policy: evaluate deal completeness
  Policy-->>MCP: deal.company_recommended
  MCP-->>Noros: issue and suggested fix
  Noros->>MCP: search_records({ type: "company", text: "Acme" })
  MCP-->>Noros: company candidates
  Noros->>MCP: update_record({ ref: deal, patch: { companyId } })
  MCP->>WriteAPI: write("record.update", input, context)
```

Repair writes are normal Write API calls. Noros does not patch storage or mutate policy state
directly.

## Example Flow: Approval

Human approval belongs above the kernel. The kernel records only the durable CRM result after an
approved write.

```mermaid
sequenceDiagram
  participant User
  participant Noros
  participant Approval as Approval checkpoint
  participant MCP
  participant WriteAPI as Write API

  User->>Noros: "Archive this stale deal"
  Noros->>Approval: request approval for archive_record
  Approval-->>Noros: approved
  Noros->>MCP: archive_record({ workspaceId, ref: deal })
  MCP->>WriteAPI: write("record.archive", input, context)
  WriteAPI-->>MCP: archived deal
  MCP-->>Noros: archived deal
  Noros-->>User: confirmation
```

If approval is denied, no CRM write occurs. If approval is granted, the Write API appends the audit
event with the adapter context.

## Event-Driven Monitoring

Noros may watch the Event Log through MCP resources or the Read API:

```ts
await readMcpResource(crm, "crm://workspace/workspace_1/events?limit=100", { context })
```

Useful monitors include:

- new deal without company
- overdue task without assignee
- customer activity without follow-up
- import completed with ambiguous external references
- policy issue unresolved after a configured interval

Monitors can propose writes, create tasks, or ask for approval, but the final durable change still
uses the Write API.

## Non-Goals

- no Noros dependency in the kernel
- no agent prompt logic inside the kernel
- no LLM judgment for kernel invariants
- no Noros-only durable CRM memory
- no direct Storage API access from Noros
- no hidden mutation outside Write API

## Design Rule

Bare CRM is the durable memory. Noros is optional orchestration around that memory.
