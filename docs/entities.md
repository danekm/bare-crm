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

- `id`
- `type`
- `workspaceId`
- `createdAt`
- `updatedAt`
- `archivedAt`
- `createdBy`
- `ownerId`
- `source`
- `externalRefs`
- `tags`
- `custom`
- `version`

## Relations

Relations are first-class records. They model typed edges between any two records.

Examples:

- `works_at`: person -> company
- `primary_contact_for`: person -> company
- `champion_for`: person -> deal
- `mentioned_in`: person/company/deal -> note/activity/file
- `introduced_by`: person -> person
- `parent_company_of`: company -> company

## Non-Invariants

The kernel does not require:

- every deal to have a company
- every company to have a person
- every person to have an email
- every task to have an assignee
- every deal stage to follow a built-in pipeline

Those are optional policies above the kernel.
