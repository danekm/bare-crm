# Bare CRM Agent Guide

Use `agent start <ticket>` or `npm run agent:start -- --ticket <KEY>` to begin ticket work. Agent
Work Preflight runs automatically as part of start. Use `npm run preflight` and
`npm run preflight:report` only as read-only repo-local diagnostics, not as the implementation
entrypoint. Missing Linear tickets or ticket state block repo-tracked edits, commits, PRs, deploys,
and completion claims. Dirty worktrees must go through Platform workspace recovery or a clean
isolated worktree instead of manual stash/reset flows. Do not hand-maintain lifecycle state in this
repo; the shared Platform agent engine owns tickets, evidence, validation, and merge readiness.
