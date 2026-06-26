# Bare Google Tasks Plugin

Bare Google Tasks is a bidirectional execution adapter for CRM tasks.

Bare CRM remains the durable business memory. Google Tasks is the personal task surface where users
can see, reschedule, complete, or delete selected tasks.

The implementation lives in `src/adapters/google-tasks/`. `plugins/bare-google-tasks/` is a
compatibility package shell with the portable manifest and README.

## Sync Model

The adapter syncs selected CRM tasks:

```txt
Bare CRM Task
  <-> Google Tasks adapter
    <-> Google Tasks API
```

It does not import every personal Google task by default. Google tasks are pulled into CRM only when
they are linked by adapter state or contain the Bare CRM marker in their notes.

## CRM Mapping

| Bare CRM Task      | Google Task                          |
| ------------------ | ------------------------------------ |
| `title`            | `title`                              |
| `body`             | `notes` plus Bare CRM marker         |
| `status: todo`     | `status: needsAction`                |
| `status: doing`    | `status: needsAction`                |
| `status: done`     | `status: completed`                  |
| `status: canceled` | `deleted` on pull, canceled in CRM   |
| `dueAt`            | `due` date at midnight UTC           |
| `externalRefs`     | `google-tasks:{taskListId}:{taskId}` |

Google Tasks stores only the date portion of due dates. The adapter normalizes Google due dates to
midnight UTC, so timed CRM due dates should not be expected to round-trip exactly.

## Conflict Rule

The first implementation uses a conservative conflict policy:

- CRM wins for title, body, and related business context.
- Google wins for completion/deletion state.
- Google personal tasks are ignored unless already linked to a CRM task.

This keeps customer/task context from being overwritten by personal task edits.

## Polling

The Google Tasks API supports polling with `updatedMin`, pagination, and flags for completed,
deleted, hidden, and assigned tasks. The adapter stores the last seen update timestamp in
plugin-owned state.

Sync calls use:

- `showCompleted: true`
- `showDeleted: true`
- `showHidden: true`
- `showAssigned: false`
- `updatedMin` from adapter state

Assigned tasks from Docs or Chat have source-specific behavior, so the initial adapter treats them
as out of scope.

## Minimal Usage

```ts
import {
  createBareGoogleTasksRunner,
  createMemoryBareGoogleTasksStateStore,
  installBareGoogleTasksPlugin,
} from "@bare-crm/kernel/plugins/google-tasks"

installBareGoogleTasksPlugin(host, { workspaceId })

const runner = createBareGoogleTasksRunner({
  host,
  workspaceId,
  client,
  state: createMemoryBareGoogleTasksStateStore(),
  taskListId: "default",
})

await runner.pushTask({ task })
await runner.sync()
```

## Safety

The adapter follows [Plugin Data Safety](plugin-data-safety.md):

- OAuth tokens stay in the secret store
- sync cursors and task-id mappings stay adapter-owned
- all CRM writes go through the Extension Host and Write API
- deleted Google tasks map to canceled CRM tasks, not hard deletes
