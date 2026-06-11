# MCP Adapter

Bare CRM should have an MCP server, but MCP should be an adapter rather than the core runtime.

## Tools

Initial MCP tools should map to stable kernel commands and queries:

- `search_records`
- `get_record`
- `create_person`
- `create_company`
- `create_deal`
- `create_activity`
- `create_task`
- `update_record`
- `archive_record`
- `link_records`
- `get_timeline`

## Resources

Useful MCP resources:

```txt
crm://record/{type}/{id}
crm://timeline/{type}/{id}
crm://search?q={query}
crm://workspace/{workspaceId}/schema
```

## Noros Integration

Noros can treat Bare CRM as durable business memory:

- agents call MCP tools instead of touching storage
- policy failures return structured repair suggestions
- workflows can request approval before irreversible actions
- event subscriptions can start long-running jobs
- plugins can package Noros workflows next to CRM policies and fields

The intended relationship:

```txt
Bare CRM kernel: stores facts and emits events
MCP server: exposes safe CRM tools to models and agents
Noros: orchestrates agents, approvals, monitors, and long-running workflows
Plugins: add domain behavior without changing the kernel
```
