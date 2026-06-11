# MCP Adapter

Bare CRM should have an MCP server, but MCP is optional and outside the core runtime. It is a
gateway over the Write API and Read API.

## Tools

Initial MCP tools should map to stable Write API and Read API operations:

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

- agents call MCP tools instead of touching the Storage API
- policy failures return structured repair suggestions
- optional workflows can request approval before irreversible actions
- Event Log subscriptions can start long-running jobs outside the kernel
- plugins can package Noros workflows next to CRM policies and fields

The intended relationship:

```txt
Bare CRM kernel: stores facts through Write API/Read API and emits events
MCP server: exposes safe CRM tools to models and agents outside the kernel
Noros: orchestrates agents, approvals, monitors, and long-running workflows
Plugins: add domain behavior without changing the kernel
```
