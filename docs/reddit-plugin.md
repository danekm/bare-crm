# Bare Reddit Plugin

Bare Reddit is an observe-first social adapter. It follows selected Reddit submissions or comments
that the user started and stores only durable relationship memory in Bare CRM.

The executable first slice lives in `src/adapters/reddit/`. It includes a portable `plugin.json`,
typed provider snapshots, mapper helpers, a deterministic thread runner, a fakeable sync harness,
and plugin-owned watched-thread state. `plugins/bare-reddit/` remains as a compatibility package
shell and README location.

The plugin follows [Plugin Data Safety](plugin-data-safety.md): minimize copied data, keep OAuth
tokens and API credentials out of CRM, scope every operation by workspace, and make sync idempotent.

## Why This Is Not A Social Inbox

Reddit remains the discussion surface. Bare CRM stores normalized relationship memory:

- `Collection` for a selected Reddit submission or comment thread worth following
- `Activity` for new inbound replies worth recording
- `Task` for optional human review
- `Relation`, `Note`, or `File` only when a host workflow deliberately creates them

Raw Reddit payloads, OAuth tokens, API credentials, sync cursors, seen reply ids, ignored threads,
and provider configuration are plugin-owned data.

## Thread Sources

The adapter is shaped around selected threads, not broad subreddit monitoring:

- submissions the user wants to follow
- comments the user started and wants to track
- inbox reply streams or comment trees normalized by a production host

The current package defines a `RedditApiClient` boundary. A production host can back that with OAuth
polling of inbox replies, user submissions/comments, or specific comment trees and normalize the
result into `RedditThreadSnapshot`.

## Sync Flow

Expected flow:

1. Seed a watched thread from a Reddit submission/comment thing id or permalink.
2. Fetch thread changes through the adapter client.
3. Ignore outbound/self replies unless `includeOutbound` is enabled.
4. Deduplicate by reply thing id and CRM external refs.
5. Create or reuse a `reddit.thread` collection.
6. Create message activities for unseen inbound replies.
7. Optionally create review tasks for replies marked `requiresReview`.
8. Store watched-thread state and seen reply ids outside the kernel.

The adapter does not auto-submit replies.

## Kernel Command Usage

Observed or confirmed replies map to existing kernel writes:

| Plugin action       | Kernel operation    |
| ------------------- | ------------------- |
| create thread group | `collection.create` |
| save observed reply | `activity.create`   |
| create review task  | `task.create`       |

Use `source: "plugin"` and stable external refs:

```ts
;[
  { system: "reddit", id: "thread:t3_launch1", kind: "canonical" },
  { system: "reddit", id: "reply:t1_reply1", kind: "dedupe" },
]
```

Plugin-owned Reddit detail belongs in `custom.reddit`.

## Dedupe

Stable idempotency keys:

```txt
reddit:thread:{threadId}:collection
reddit:reply:{thingId}:activity
reddit:reply:{thingId}:review-task
```

Repeated polling or manual sync should not create duplicate collections, activities, or tasks.

## Non-Goals

- no Reddit-specific kernel entity
- no broad subreddit monitoring in the kernel
- no raw payload dump into CRM records
- no automatic public replies
- no production OAuth polling worker in the first helper slice
