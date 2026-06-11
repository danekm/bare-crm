# Bare Gmail Workspace Plugin

This folder is the Gmail plugin boundary. It is intentionally outside `src/` so Gmail behavior can
grow without adding Gmail-specific logic to the kernel.

## What It Owns

- `plugin.json`: declared capabilities and contributions
- `runner.ts`: deterministic message snapshot runner
- `mod.ts`: public plugin module

The runner only talks to Bare CRM through the Extension Host:

```txt
Gmail plugin -> Extension Host -> Read API / Write API -> Kernel
```

## Current Slice

The first executable slice processes a `GmailMessageSnapshot`.

- `ignore`, `observe_only`, and `suggest` do not write kernel records by default
- `promote` creates or reuses a `gmail.thread` collection
- promoted messages create or reuse one email activity
- promoted messages with follow-up intent create or reuse one task
- all dedupe uses Gmail thread/message external refs through `readAsPlugin`

Live OAuth, Pub/Sub watch refresh, Gmail history cursors, and encrypted secret storage belong in
this folder or the host adapters, not in the kernel.
