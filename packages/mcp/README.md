# Governanator private MCP adapter

Bun stdio application for fourteen immutable governance queries. Build with Moon and launch with explicit `--root PATH --snapshot PATH`. See [operator runbook](../../docs/mcp.md).

All tools are read-only. Saved decisions remain unverified or simulated; this application never executes producers, edits files, approves or publishes. It does not configure MCP clients automatically.
