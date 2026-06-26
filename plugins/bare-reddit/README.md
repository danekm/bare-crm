# Bare Reddit Threads

Bare Reddit Threads is an observe-first channel adapter for Bare CRM.

The implementation lives in `src/adapters/reddit/`. This package directory is a compatibility shell
for plugin packaging and examples.

The adapter follows selected Reddit submissions or comments that the user started. A production host
can back the `RedditApiClient` with OAuth polling of the Reddit Data API, inbox replies, or specific
comment trees.

It writes normalized CRM memory as `reddit.thread` collections, message activities, and optional
review tasks. It does not auto-submit replies.

Safety posture follows [Plugin Data Safety](../../docs/plugin-data-safety.md):

- workspace scope applies to OAuth token refs, watched thread ids, seen reply ids, and writes
- minimization: only reply body, author name, timestamps, provider ids, subreddit, score, and
  optional permalinks enter CRM records
- no raw payload storage in kernel records
- OAuth tokens, API credentials, sync cursors, and seen reply state stay adapter-owned
- idempotency uses `reddit:thread:{threadId}:collection`, `reddit:reply:{thingId}:activity`, and
  `reddit:reply:{thingId}:review-task`

Retention and deletion:

- disconnecting a workspace should delete adapter-owned token refs, watched thread state, and seen
  reply ids
- deleted Reddit content should not be refreshed into CRM; production sync can redact previously
  copied text if workspace policy requires provider deletion mirroring
- CRM records keep only normalized memory and provider refs; deleting retained CRM memory remains a
  normal CRM archive/delete workflow
