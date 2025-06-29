# Squabble Permission Model

## Overview

Squabble uses two layers of permission control:
1. **Server-side mode detection** via `SQUABBLE_MODE` environment variable
2. **Claude CLI permission flags** (`--allowedTools` and `--disallowedTools`)

## Server-Side Modes

Set the mode when starting the MCP server:
```bash
# Engineer mode (default)
SQUABBLE_MODE=engineer npx @squabble/mcp-server

# PM mode 
SQUABBLE_MODE=pm npx @squabble/mcp-server

# Specialist mode
SQUABBLE_MODE=specialist npx @squabble/mcp-server
```

## Key Changes

1. **`update_tasks` is now `pm_update_tasks`** - Makes it explicitly clear this is PM-only
2. **Engineers cannot modify tasks directly** - They must use `propose_modification` to suggest changes
3. **PM spawned via Claude CLI needs proper permissions** - Use the examples below

## Role Permissions

### Lead Engineer (Default Claude Code)
- **Can use**: All tools EXCEPT `pm_update_tasks`
- **Cannot use**: `pm_update_tasks` (must use `propose_modification` instead)

```bash
# Engineer doesn't need special flags - just restrict PM tools
claude --disallowedTools "mcp__squabble__pm_update_tasks"
```

### Product Manager (PM)
- **Can use**: ALL tools including `pm_update_tasks`
- **Special access**: Can directly modify task list

```bash
# Spawn PM with full access
claude -p --system-prompt "You are the Product Manager..." \
  --allowedTools "mcp__squabble__*" "Read" "Write" "Edit" "Grep" "Glob"
```

### Specialists (Security, Architect, etc.)
- **Can use**: Read-only tools for analysis
- **Cannot use**: Any modification tools

```bash
# Spawn specialist with restricted access
claude -p --system-prompt "You are a Security Specialist..." \
  --allowedTools "Read" "Grep" "Glob" "LS" "WebSearch" "mcp__squabble__save_decision" \
  --disallowedTools "Write" "Edit" "mcp__squabble__*_tasks" "Bash"
```

## Implementation in Squabble

When `consult_pm` or other tools spawn agents, they should include appropriate permission flags:

```typescript
// For PM
const args = [
  '-p',
  '--system-prompt', pmSystemPrompt,
  '--allowedTools', 'mcp__squabble__*', 'Read', 'Write', 'Edit', 'Grep', 'Glob'
];

// For Specialists
const args = [
  '-p', 
  '--system-prompt', specialistPrompt,
  '--allowedTools', 'Read', 'Grep', 'Glob', 'LS',
  '--disallowedTools', 'Write', 'Edit', 'mcp__squabble__*_tasks'
];
```

## Workflow Example

1. **Engineer** tries to update tasks directly:
   ```
   > mcp__squabble__pm_update_tasks
   ❌ Error: Permission denied. Use propose_modification to suggest task changes.
   ```

2. **Engineer** proposes changes correctly:
   ```
   > propose_modification({type: "ADD", ...})
   ✅ Proposal sent to PM for approval
   ```

3. **PM** reviews and applies changes:
   ```
   > pm_update_tasks({modifications: [...]})
   ✅ Tasks updated successfully
   ```

## Security Notes

- Even with CLI flags, we should add server-side validation as defense-in-depth
- Audit logging tracks who made what changes
- Permission flags are a first line of defense, not the only protection