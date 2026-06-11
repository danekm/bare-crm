# Entities

The kernel owns a small set of universal CRM records:

- `Person`
- `Company`
- `Deal`
- `Activity`
- `Note`
- `Task`
- `File`
- `Relation`

Every record has:

| Field          | Required | Purpose                                   | Validation expectation                              |
| -------------- | -------- | ----------------------------------------- | --------------------------------------------------- |
| `id`           | yes      | stable record identity inside a workspace | non-empty string, unique per workspace/type         |
| `type`         | yes      | one of the kernel entity types            | known entity type                                   |
| `workspaceId`  | yes      | workspace ownership and isolation         | non-empty string                                    |
| `createdAt`    | yes      | creation timestamp                        | ISO timestamp assigned by kernel                    |
| `updatedAt`    | yes      | last mutation timestamp                   | ISO timestamp assigned by kernel                    |
| `archivedAt`   | no       | soft archive timestamp                    | absent unless archived                              |
| `createdBy`    | no       | creator actor/user id                     | string when supplied                                |
| `ownerId`      | no       | owning user/team id                       | string when supplied                                |
| `source`       | yes      | origin of the record                      | `manual`, `import`, `plugin`, `sync`, or `agent`    |
| `externalRefs` | no       | source-system identity links              | array of `{ system, id, url?, kind?, lastSeenAt? }` |
| `tags`         | no       | lightweight labels                        | string array                                        |
| `custom`       | no       | extension data                            | JSON object                                         |
| `version`      | yes      | optimistic concurrency counter            | positive integer advanced by writes                 |

## Entity Contracts

`Person`:

- required: `name`
- optional: `emails`, `phones`, `title`, `companyId`, `location`, `avatarUrl`, `status`,
  `lastContactedAt`

`Company`:

- required: `name`
- optional: `domains`, `industry`, `size`, `revenue`, `location`, `parentCompanyId`, `status`

`Deal`:

- required: `name`, `stage`, `status`
- optional: `companyId`, `personIds`, `value`, `currency`, `probability`, `expectedCloseAt`,
  `closedAt`, `pipelineId`

`Activity`:

- required: `kind`, `occurredAt`
- optional: `subject`, `body`, `direction`, `participants`, `related`

`Note`:

- required: `body`, `related`
- optional: `pinned`

`Task`:

- required: `title`, `status`
- optional: `body`, `dueAt`, `assigneeId`, `priority`, `related`

`File`:

- required: `filename`, `mimeType`, `size`, `storageKey`
- optional: `checksum`, `related`

`Relation`:

- required: `from`, `to`, `kind`
- optional: `strength`

## Relations

Relations are first-class records. They model typed edges between any two records.

Examples:

- `works_at`: person -> company
- `primary_contact_for`: person -> company
- `champion_for`: person -> deal
- `mentioned_in`: person/company/deal -> note/activity/file
- `introduced_by`: person -> person
- `parent_company_of`: company -> company

Relation endpoints must be typed refs to existing records in the same workspace. Relations are the
preferred way to model cross-entity meaning when a link is not a universal field.

## Kernel Invariants

The kernel enforces universal storage and identity rules:

- records have stable identity, type, workspace, timestamps, and version
- write inputs use known entity types and operation names
- relation endpoints exist in the same workspace
- updates preserve `id`, `type`, `workspaceId`, and `createdAt`
- updates advance `version`
- archives set `archivedAt` and hide records from default reads
- successful writes append Event Log entries
- workspace context must match write/read input when context is supplied

## Non-Invariants

The kernel does not require:

- every deal to have a company
- every company to have a person
- every person to have an email
- every task to have an assignee
- every deal stage to follow a built-in pipeline

Those are optional policies above the kernel.
