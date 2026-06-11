# Contributing

Bare CRM is a tiny CRM kernel. Contributions are welcome when they make the kernel clearer, more
reliable, or easier to build on without turning it into a full CRM application.

## Core Rule

Keep universal infrastructure in the kernel. Put business-specific behavior above it.

Good kernel changes usually affect:

- record identity, workspace isolation, timestamps, versions, or archival semantics
- Write API contracts
- Read API contracts
- Event Log semantics
- Storage API conformance
- first-class storage adapters
- permission/context enforcement
- import/export primitives that preserve CRM identity

Changes that usually belong outside the kernel:

- sales pipeline opinions
- "every deal must have a company" rules
- UI flows
- workflow runners
- agent prompts
- channel-specific sync behavior
- enrichment jobs
- marketplace or packaging behavior

Those belong in policies, workflows, plugins, MCP adapters, Noros orchestration, CLIs, UIs, or
examples.

## Development

Run the full verification set before submitting changes:

```sh
deno fmt
deno task check
deno task test
```

Behavior changes should include tests. Storage behavior should stay covered across memory, SQLite,
and Postgres-compatible adapters.

## API Changes

Public contract changes should update the relevant docs:

- `docs/entities.md`
- `docs/write-api.md`
- `docs/read-api.md`
- `docs/event-log.md`
- `docs/storage-api.md`
- `docs/permissions.md`
- `docs/conformance.md`

Prefer boring names. The public API should describe the primitive directly: Write API, Read API,
Event Log, Storage API, plugin manifest, MCP adapter.

## Dependencies

Keep the reference kernel dependency-light. Add dependencies only when they clearly improve
correctness, portability, or adapter compatibility.

Optional integrations should stay optional.

## License

By contributing, you agree that your contribution is licensed under the MIT license used by this
repository.
