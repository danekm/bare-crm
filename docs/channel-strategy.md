# Channel Strategy

Bare CRM should support email, social messaging, customer support, and meeting recordings without
turning the kernel into an inbox, helpdesk, social suite, or call recorder.

The kernel owns durable business memory. Channels provide source material.

```txt
Email, messaging, support, meetings
  -> channel plugins
  -> kernel commands
  -> collections, activities, notes, tasks, files, relations, events
```

## Core Boundary

The kernel should keep a small set of stable records:

- `Person`
- `Company`
- `Deal`
- `Collection`
- `Activity`
- `Note`
- `Task`
- `File`
- `Relation`

Channel-specific objects such as email messages, Outlook conversations, Instagram DMs, WhatsApp
threads, Reddit comments, tweets, support tickets, transcripts, and recording jobs should not become
kernel entities by default.

They are external sources. The kernel stores what they mean for the customer relationship.

## Collection And Activity Versus Source

An external source is evidence. A collection is CRM context. An activity is CRM memory.

```txt
External source:
  Provider-owned, messy, duplicated, quoted, edited, deleted, or platform-specific.

Activity:
  A normalized record that says a meaningful interaction happened.

Collection:
  A durable group of related CRM records around one business context.
```

Examples:

- a 17-message Outlook thread can produce one collection plus email activities: "Renewal pricing
  discussion with Acme"
- a WhatsApp exchange can produce one collection and one activity: "Customer asked for delivery
  status"
- a Reddit complaint can produce one collection, one activity, and one task: "Investigate public
  complaint"
- a meeting series can produce one collection, meeting activities, transcript files, and follow-up
  tasks

The kernel does not need to parse every source format. It needs to preserve references, provenance,
relationships, and business outcomes.

## Plugin Responsibilities

Channel plugins own the messy parts:

- provider authentication
- provider webhooks or polling
- idempotent sync state
- quoted text and signature stripping
- transcript processing
- message classification
- contact and company matching
- suggested related records
- attachment and file handling
- redaction and retention choices
- channel-native UI surfaces, such as an Outlook sidecar

Plugins write back through kernel commands:

- `crm.write("activity.create", input)`
- `crm.write("collection.create", input)`
- `crm.write("note.create", input)`
- `crm.write("task.create", input)`
- `crm.write("file.create", input)`
- `crm.write("relation.create", input)`
- `crm.write("record.update", input)`

Plugins may expose their own adapter commands, but those commands should be translated into kernel
commands rather than bypassing the kernel.

## Kernel Responsibilities

The kernel should provide the primitives that make channel plugins safe and durable:

- stable records and typed references
- collections for durable groupings across channel events
- `source` metadata
- `externalRefs` for provider ids and URLs
- `custom` data for plugin-owned annotations
- Write API validation
- optional policies before writes
- Event Log entries after writes
- optional workflows after committed events
- timeline reads across all channels
- search reads over normalized CRM memory

The kernel should not know how Outlook threads, WhatsApp messages, or meeting transcripts are
structured.

## Email

People should keep working in email. Bare CRM should appear inside email as context and action, not
as a second inbox.

An email plugin should:

- observe new messages through provider sync
- ignore obvious internal and automated noise
- resolve external participants to people and companies
- suggest related deals or tasks
- create or update email activities when business-relevant
- keep links back to the original email or thread
- render CRM context inside Outlook or Gmail

The sidecar experience should answer:

- who is this person or company?
- what deal, task, or customer issue is this connected to?
- what has happened before?
- what does this message change?
- what should happen next?

The default storage posture should be conservative:

```txt
Ignore:
  internal-only mail, newsletters, personal mail, automated noise

Lightweight memory:
  external business mail with metadata, participants, short summary, and provider ref

Promoted memory:
  deal-critical, support-critical, or explicitly saved email with richer summary and follow-up tasks
```

## Customer Support And Messaging

Support can arrive through many channels:

- email
- Instagram
- Facebook
- WhatsApp
- Reddit
- X/Twitter
- web forms
- chat tools

The kernel should not model each channel separately. Each plugin should normalize meaningful
interactions into the same CRM primitives:

- `Activity` for the interaction
- `Collection` for the larger conversation, issue, case, or workstream
- `Task` for required action
- `Note` for durable internal context
- `Relation` for links between people, companies, deals, collections, issues, and activities
- `File` for screenshots, attachments, exports, or transcripts

This lets the timeline for a person, company, deal, or collection show one coherent history even
when the work happened across many channels.

## Meeting Recordings

Meeting tools should also be plugins.

A meeting plugin should:

- create an activity for the meeting
- add the meeting to a collection when it belongs to a larger workstream
- attach the recording or transcript as a file when allowed
- summarize decisions, objections, risks, and follow-ups
- create tasks for next steps
- relate the meeting to people, companies, and deals
- preserve provider refs back to the recording system

The recording file and transcript are source artifacts. The CRM memory is the collection, meeting
activity, summary, relations, and follow-up tasks.

## Why This Is Not A Strict CRM

A strict CRM asks people to leave their work surface and enter data into the CRM.

Bare CRM should let people work where they already work. Email, meetings, and messaging remain the
front doors. The kernel quietly stores the shared memory those surfaces generate.

## Why This Is Not Just An Embedded Gmail CRM

An embedded Gmail CRM treats the inbox as the product center.

Bare CRM treats the kernel as the product center and email as one channel. The same customer memory
can appear in Outlook, Gmail, Slack, support tools, a web CRM, MCP agents, mobile apps, or command
line tools.

## Stability Rule

Do not add a kernel entity for every new channel.

First ask whether the channel can be represented as:

- an activity
- a collection
- a note
- a task
- a file
- a relation
- external refs
- plugin-owned custom data

Only promote a new concept into the kernel if it is universal across many channels and cannot be
modeled cleanly with the existing primitives.
