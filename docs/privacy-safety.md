# Privacy Safety

Bare CRM stores private customer data by design. The safety goal is not that private data can never
be read; authorized Read API calls must return CRM facts. The safety goal is that operational
surfaces do not leak private data accidentally.

## Safe By Default Surfaces

These surfaces should return metadata, counts, codes, and redacted status by default:

- Admin API diagnostics
- CLI `doctor`
- CLI database status and migration output
- plugin validation summaries
- future dashboards, monitors, canaries, and migration rehearsals

They should not return raw records, Event Log snapshots, note bodies, email addresses, provider
payloads, access tokens, refresh tokens, passwords, API keys, or connection strings.

## Current Guardrails

- Admin event metadata strips committed Event Log `record` snapshots.
- CLI doctor does not read or export raw CRM records or Event Log snapshots.
- CLI operator errors redact email addresses, common API tokens, secret query values, and Postgres
  connection strings.
- Plugin manifests cannot request `storage:*` capabilities.
- Tests seed obvious private fixture values and assert they do not appear in safe admin/CLI output.

## Design Rule

If a new admin, CLI, monitor, dashboard, canary, or migration command needs CRM data, add a privacy
regression test before exposing the output.

Use the Read API for intentional data reads. Use the Admin API or another explicitly redacted shape
for operational surfaces.
