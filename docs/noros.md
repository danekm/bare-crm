# Noros Integration

Noros is optional orchestration outside the core kernel.

Bare CRM owns durable CRM facts:

- Write API
- Read API
- Event Log
- Storage API
- records and relations

Noros may coordinate:

- multi-step agent workflows
- repair loops
- approval checkpoints
- monitoring unresolved completeness issues
- summaries and follow-ups

Noros should use Bare CRM through MCP or another adapter. Bare CRM must work without Noros.
