# Bare Gmail Workspace Plugin

This folder is the Gmail plugin boundary. It is intentionally outside `src/` so Gmail behavior can
grow without adding Gmail-specific logic to the kernel.

## What It Owns

- `plugin.json`: declared capabilities and contributions
- `addon.ts`: Gmail add-on card/action model and plugin-owned user preferences
- `gmail_api.ts`: Gmail API history/message/watch transport with injectable OAuth and fetch
- `google_addon.ts`: Google Workspace add-on manifest and CardService-style adapter specs
- `review.ts`: plugin-owned review items and user action handling
- `runner.ts`: deterministic message snapshot runner
- `state.ts`: memory and JSON-file plugin state stores for cursors, preferences, reviews, and OAuth
  secret refs
- `sync.ts`: fakeable sync transport and cursor harness
- `mod.ts`: public plugin module

The runner and sync harness only talk to Bare CRM through the Extension Host:

```txt
Gmail plugin -> Extension Host -> Read API / Write API -> Kernel
```

## Data Safety

This plugin follows [Plugin Data Safety](../../docs/plugin-data-safety.md).

- workspace scope: every runner and sync call is passed a `workspaceId`
- minimization: ignored, observe-only, and suggestion-only messages do not write CRM records by
  default
- no raw payload storage: raw Gmail messages, OAuth tokens, refresh tokens, labels, and sync cursors
  stay in plugin-owned state, not kernel records
- secrets: live OAuth secrets belong in the Extension Host secret store or production secret manager
- idempotency: Gmail thread/message refs and stable idempotency keys prevent duplicate CRM records

## Current Slice

The first executable slice processes a `GmailMessageSnapshot`.

- `createBareGmailAddonCard` renders a portable Gmail panel model for the current message
- `createBareGmailAddonBackendRequest` carries the current message/thread refs to the plugin backend
- `toGoogleWorkspaceCardSpec` translates the portable card model into a Google CardService-style
  spec that Apps Script can render
- `createBareGmailGoogleWorkspaceManifest` declares the Gmail contextual trigger and required scopes
- `createGmailApiSyncTransport` implements the Gmail history/message fetch contract behind the
  fakeable sync transport interface
- `watchBareGmailMailbox` registers Gmail mailbox watches for Pub/Sub topic notifications
- `refreshBareGmailAccessToken` and `createGmailRefreshAccessTokenProvider` resolve secret refs into
  short-lived Gmail API access tokens
- `createMemoryBareGmailPreferenceStore` keeps ignore sender/domain feedback outside kernel records
- `queueBareGmailReviewItem` stores suggestion decisions outside kernel records
- `handleBareGmailReviewAction` routes confirmed user actions through plugin preferences or the
  Extension Host
- `createMemoryBareGmailPluginStateStore` and `createJsonFileBareGmailPluginStateStore` persist
  plugin-owned state without storing raw OAuth token values in CRM records
- `ignore`, `observe_only`, and `suggest` do not write kernel records by default
- `promote` creates or reuses a `gmail.thread` collection
- promoted messages create or reuse one email activity
- promoted messages with follow-up intent create or reuse one task
- all dedupe uses Gmail thread/message external refs through `readAsPlugin`
- `syncBareGmailMessages` advances the plugin cursor only after a full batch succeeds
- `createStaticBareGmailSyncTransport` lets tests exercise sync without Google OAuth/API

Live OAuth, Pub/Sub watch refresh, Gmail history fetching, and encrypted secret storage belong in
this folder or the host adapters, not in the kernel. They should plug into the transport/state
interfaces in `sync.ts`.
