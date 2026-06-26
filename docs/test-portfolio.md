# Test Portfolio

Bare CRM uses tests as a boundary system. The goal is not to create a large application shell around
the kernel. The goal is to prove the small contracts that make the kernel safe to build on.

## Test Layers

| Layer                        | Purpose                                           | Current coverage | Runs by default |
| ---------------------------- | ------------------------------------------------- | ---------------- | --------------- |
| Kernel contract tests        | Write API, Read API, Event Log, permissions       | yes              | yes             |
| Storage conformance tests    | Storage behavior across memory, SQLite, Postgres  | yes              | yes             |
| Migration tests              | Schema ledger, apply, dry-run, rerun stability    | yes              | yes             |
| Adapter boundary tests       | MCP, import/export, plugin manifest boundaries    | yes              | yes             |
| Extension host tests         | plugin runtime boundary and workspace state       | yes              | yes             |
| CLI tests                    | Operator command behavior and safe output         | yes              | yes             |
| Project/plugin tests         | Example plugin behavior                           | yes              | yes             |
| Privacy/security regressions | No raw data in diagnostics, no storage capability | partial          | yes             |
| Live Postgres tests          | Real hosted/container Postgres behavior           | planned          | no              |
| Canary checks                | Staging/production readiness checks               | planned          | no              |
| Shadow migration rehearsals  | Production-like migration rehearsal               | planned          | no              |
| Property/fuzz tests          | Generated invariant checks                        | planned later    | no              |

## Current Default Suite

Run the default suite with:

```sh
deno fmt
deno task check
deno task test
```

`deno task test` runs without hosted services. It uses:

- in-memory storage for fast kernel scenarios
- real temporary SQLite databases
- a fake Postgres-compatible client for adapter contract coverage

## Current Test Files

| File                                       | Layer                   | What it protects                                       |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------ |
| `tests/kernel.test.ts`                     | kernel contract         | writes, reads, events, permissions, idempotency        |
| `tests/storage.test.ts`                    | storage conformance     | storage transactions, filtering, rollback, conflicts   |
| `tests/migrations.test.ts`                 | migrations              | SQLite/Postgres migration status, dry-run, rerun       |
| `tests/cli.test.ts`                        | CLI/privacy             | command output, errors, doctor redaction, migrations   |
| `tests/mcp.test.ts`                        | adapter boundary        | MCP maps to Read/Write APIs and structured errors      |
| `tests/plugins.test.ts`                    | plugin boundary         | manifest validation and forbidden storage capability   |
| `tests/import_export.test.ts`              | adapter boundary        | import/export uses Read API and Write API              |
| `tests/extensions.test.ts`                 | extension host          | plugin lifecycle, capabilities, profiles, cursors      |
| `tests/hard_rules.test.ts`                 | architecture guardrails | hard-rule docs and plugin storage-access prohibition   |
| `tests/generated_docs.test.ts`             | documentation contract  | generated safety coverage docs stay reproducible       |
| `tests/plugin_development_docs.test.ts`    | documentation contract  | plugin authoring docs keep boundary language           |
| `tests/plugin_data_safety_docs.test.ts`    | documentation contract  | plugin data-safety docs keep privacy boundary language |
| `tests/plugin_data_safety_runtime.test.ts` | privacy/security        | plugin secrets, raw payloads, and audit metadata       |
| `tests/privacy_safety.test.ts`             | privacy/security        | safe admin/CLI output omits private fixture values     |
| `tests/gmail_plugin.test.ts`               | project/plugin behavior | Gmail helper behavior outside kernel conformance       |
| `tests/bare_gmail_plugin.test.ts`          | project/plugin behavior | Gmail runner idempotency and capability boundaries     |
| `tests/bare_gmail_sync.test.ts`            | project/plugin behavior | Gmail sync cursor safety with fake transport           |
| `tests/bare_google_tasks_plugin.test.ts`   | project/plugin behavior | Google Tasks bidirectional sync behavior               |
| `tests/bare_granola_plugin.test.ts`        | project/plugin behavior | Granola meeting memory, privacy, and sync behavior     |
| `tests/supabase_users_plugin.test.ts`      | project/plugin behavior | Supabase app-user lookup plugin behavior               |
| `tests/fake_postgres.ts`                   | test support            | local Postgres-compatible executor for contract tests  |

## Security And Privacy Tests

Current coverage:

- plugin manifests reject `storage:*`
- example plugin manifests must not request storage access
- MCP resources reject workspace mismatch before kernel reads
- strict capability mode requires context, actor, and operation capability
- Extension Host enforces approved plugin capabilities before kernel writes
- Extension Host scopes profiles, event cursors, and secrets by workspace/plugin
- CLI doctor output says it does not read/export raw records or Event Log snapshots
- CLI doctor tests assert obvious private fixture values are not printed
- admin metadata tests assert Event Log record snapshots are not returned
- privacy regression tests seed private fixture values and assert safe outputs omit them
- plugin data-safety docs assert minimization, workspace scope, secrets, no raw payload storage,
  idempotency, and retention language
- plugin data-safety runtime tests assert Supabase secrets, raw Supabase fields, and raw Gmail
  payload fields do not enter CRM records or Event Log snapshots
- plugin data-safety runtime tests assert plugin writes carry plugin actor and idempotency metadata
- CLI operator errors redact common private-looking values
- migration CLI output reports metadata only

Important future additions:

- add failure-path tests for migration errors to prove failed migrations are not recorded
- add redaction tests for any future dashboard or monitor output
- add tests that secrets and connection strings are never printed in CLI errors

## Migration Tests

Current coverage:

- SQLite and Postgres have a single linear initial migration: `001 initial_schema`
- status reports applied and pending migrations
- dry-run does not mutate migration state
- applying migrations records the ledger
- rerunning migrations is stable and applies nothing twice
- Postgres `installPostgresSchema` records the initial migration

Migration tests should remain boring:

- no branching migrations
- no plugin-owned kernel migrations
- no arbitrary SQL command
- no rollback command until there is a clear operational need

## Live Postgres Tests

The default suite intentionally does not require hosted services. Live Postgres tests should be
opt-in, for example behind environment variables such as:

```txt
BARE_CRM_LIVE_POSTGRES_URL
BARE_CRM_LIVE_POSTGRES_TESTS=1
```

Those tests should verify:

- connection setup
- migration status and apply behavior
- storage conformance against a real Postgres database
- transaction rollback on live Postgres
- error messages do not expose credentials

They should run in release gates, nightly CI, or explicit local checks, not in the base suite.

## Canary Checks

Canary checks are small readiness checks against a real staging or production-like environment. They
should be read-only by default.

Useful canaries:

- can connect to storage
- schema version is current
- no pending migrations
- `crm doctor` returns structured output
- plugin manifests do not request `storage:*`
- no raw CRM data leaves the process

Canaries should output status, counts, versions, and check codes. They should not output customer
names, emails, notes, addresses, or event snapshots.

## Shadow Migration Rehearsals

A shadow migration rehearsal runs migrations against a temporary copy of a production-like database.
It is an operational safety pattern, not a unit-test requirement.

The rehearsal flow should be:

1. create a temporary database copy
2. run pending migrations
3. run storage/kernel conformance or doctor checks
4. inspect structured migration output
5. discard the temporary database

Shadow rehearsals are useful before risky schema changes or production upgrades.

## Property And Fuzz Tests

Property tests can generate many random records, relations, workspaces, and write sequences, then
assert kernel invariants:

- workspace isolation
- relation endpoints exist
- archived records stay hidden by default
- event snapshots are created after successful writes
- idempotency replays return the original result

This is useful later, after the core API settles. It is not required for the first stable kernel
slice.

## Decision Rule

Add a new test layer only when it protects a real boundary:

- public API behavior
- storage adapter equivalence
- privacy/security guarantees
- migration safety
- operator-facing command output
- plugin/MCP/import boundaries

Avoid tests that lock down incidental implementation details.
