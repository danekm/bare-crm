# Bare Granola Plugin

Bare Granola is a meeting-memory adapter. It turns useful Granola meeting summaries into CRM
timeline activity without making Bare CRM a transcript archive.

The implementation lives in `src/adapters/granola/`. `plugins/bare-granola/` is a compatibility
package shell with the portable manifest and README.

The adapter uses the official Granola API:

- `GET /v1/notes` to poll accessible notes
- `GET /v1/notes/{note_id}` to fetch one note
- `include=transcript` only when raw-note retention is explicitly enabled

Granola API keys are stored as plugin secrets and never in CRM records.

## CRM Mapping

Granola meeting notes map to existing kernel primitives:

- meeting summary -> `Activity` with `kind: "meeting"`
- explicit action item -> `Task`
- meeting series -> optional `Collection` with `kind: "granola.meeting-series"`
- attendees -> matched `Person` records
- attendee domains -> matched `Company` records

The adapter uses stable external references for idempotency:

```ts
externalRefs: ;
;[{
  system: "granola",
  id: note.id,
  kind: "canonical",
}]
```

## Safety Defaults

The adapter follows [Plugin Data Safety](plugin-data-safety.md):

- summaries are imported, transcripts are not stored in kernel records
- private meetings are skipped
- internal-only meetings can be skipped using configured internal domains
- raw notes, sync cursors, API keys, and transcript payloads stay adapter-owned
- all CRM writes go through the Extension Host and kernel Write API
- every imported activity/task uses idempotency keys and external refs

## How It Enhances CRM

When a Granola meeting is synced, the contact/company/deal timeline can show:

- the meeting summary
- attendees linked to known people and companies
- open follow-up tasks
- the meeting source and audit trail

This lets the CRM remember what happened in customer conversations without requiring a human to
manually summarize the call afterward.

## Minimal Usage

```ts
import { createBareGranolaRunner, installBareGranolaPlugin } from "@bare-crm/kernel/plugins/granola"

installBareGranolaPlugin(host, { workspaceId })

const runner = createBareGranolaRunner({
  host,
  workspaceId,
  internalDomains: ["example.com"],
  createFollowUpTasks: true,
})

await runner.processNote({ note })
```

For API polling, use `syncBareGranolaNotes` with an injected `GranolaApiClient` and
`BareGranolaPluginStateStore`.
