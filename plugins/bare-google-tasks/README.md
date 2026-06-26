# Bare Google Tasks Sync

Bare Google Tasks is an execution-surface adapter for Bare CRM tasks.

The implementation lives in `src/adapters/google-tasks/`. This package directory is a compatibility
shell with the portable `plugin.json` and public re-export.

Safety defaults:

- Bare CRM remains the durable business task source
- only selected or already-linked CRM tasks are pushed to Google Tasks
- Google completion/deletion state can update CRM tasks
- random personal Google tasks are ignored unless linked by adapter state or a Bare CRM marker
- OAuth tokens and sync cursors stay adapter-owned

This plugin follows [Plugin Data Safety](../../docs/plugin-data-safety.md).
