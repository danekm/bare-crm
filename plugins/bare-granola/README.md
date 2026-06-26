# Bare Granola Meetings

Bare Granola is a meeting-memory adapter for Bare CRM.

The implementation lives in `src/adapters/granola/`. This package directory is a compatibility shell
with the portable `plugin.json` and public re-export.

Safety defaults:

- meeting summaries become CRM activities
- explicit action items become tasks
- transcripts stay out of kernel records by default
- raw notes, sync cursors, and API secrets stay adapter-owned
- private or internal-only meetings can be skipped before any CRM write

This plugin follows [Plugin Data Safety](../../docs/plugin-data-safety.md).
