# Bare Instagram Threads

Bare Instagram Threads is an observe-first channel adapter for Bare CRM.

The implementation lives in `src/adapters/instagram/`. This package directory is a compatibility
shell for plugin packaging and examples.

The adapter follows selected Instagram surfaces:

- owned media comment threads
- mentions
- direct-message threads when a production host has approved Messaging API access

It writes normalized CRM memory as `instagram.thread` collections, message activities, and optional
review tasks. It does not auto-send replies.

Safety posture follows [Plugin Data Safety](../../docs/plugin-data-safety.md):

- workspace scope applies to tokens, watched threads, seen reply ids, and writes
- minimization: only reply text, author handle, timestamps, provider ids, and optional permalinks
  enter CRM records
- no raw payload storage in kernel records
- OAuth tokens, webhook secrets, sync cursors, and seen reply state stay adapter-owned
- idempotency uses `instagram:thread:{threadId}:collection`, `instagram:reply:{replyId}:activity`,
  and `instagram:reply:{replyId}:review-task`

Retention and deletion:

- disconnecting a workspace should delete adapter-owned token refs, webhook state, watched thread
  state, and seen reply ids
- CRM records keep only normalized memory and provider refs; deleting retained CRM memory remains a
  normal CRM archive/delete workflow
- if a provider reply is deleted, production sync should stop refreshing it and can create a
  redacted follow-up activity if the workspace requires audit continuity
