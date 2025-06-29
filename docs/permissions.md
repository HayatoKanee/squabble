# Squabble Permission Model

## Overview

Squabble uses two layers of permission control:
1. **Server-side mode detection** via `SQUABBLE_MODE` environment variable
2. **Claude CLI permission flags** (`--allowedTools` and `--disallowedTools`)

## Quick Start

### For Engineers (Default)
```bash
# Start MCP server in engineer mode (default)
npx @squabble/mcp-server

# Or explicitly:
SQUABBLE_MODE=engineer npx @squabble/mcp-server
```

### For PMs
```bash
# Start MCP server in PM mode
SQUABBLE_MODE=pm npx @squabble/mcp-server

# When spawning PM via Claude CLI:
claude -p \
  --system-prompt "You are the Product Manager for Squabble..." \
  --allowedTools "mcp__squabble__*" "Read" "Write" "Edit" "Grep" "Glob" "LS"
```

## Server-Side Modes

The MCP server enforces permissions based on the `SQUABBLE_MODE` environment variable:

| Mode | Can Use | Cannot Use | Purpose |
|------|---------|------------|---------|
| `engineer` (default) | All tools except PM-only | `pm_update_tasks` | Implementation and development |
| `pm` | All tools | None | Task management and review |
| `specialist` | Read-only tools | Write operations, task management | Advisory and analysis |

### Setting the Mode

```bash
# Engineer mode (default if not specified)
SQUABBLE_MODE=engineer npx @squabble/mcp-server

# PM mode - for task management
SQUABBLE_MODE=pm npx @squabble/mcp-server

# Specialist mode - read-only advisory
SQUABBLE_MODE=specialist npx @squabble/mcp-server
```

## Claude CLI Permission Flags

When spawning agents via Claude CLI, use these permission flags:

### Complete Examples

#### Product Manager
```bash
claude -p \
  --system-prompt "You are the Product Manager (PM) for Squabble, working in partnership with a Lead Engineer.

Your responsibilities:
1. Refine and clarify requirements through dialogue
2. Own and maintain the project task list
3. Review code and provide quality feedback
4. Make task prioritization decisions
5. Validate work before it goes to users" \
  --allowedTools "mcp__squabble__*" "Read" "Write" "Edit" "MultiEdit" "Grep" "Glob" "LS" "Bash(git *)"
```

#### Security Specialist
```bash
claude -p \
  --system-prompt "You are a Security Specialist advising on the Squabble project.

Your role:
1. Analyze security implications of proposed changes
2. Identify potential vulnerabilities
3. Recommend security best practices
4. Review authentication and authorization designs

You have read-only access and provide advisory input only." \
  --allowedTools "Read" "Grep" "Glob" "LS" "WebSearch" "WebFetch" \
  --disallowedTools "Write" "Edit" "MultiEdit" "Bash" "mcp__squabble__*_tasks"
```

#### Architecture Specialist
```bash
claude -p \
  --system-prompt "You are a System Architect advising on the Squabble project.

Your role:
1. Review system design and architecture
2. Advise on scalability and performance
3. Recommend design patterns
4. Evaluate technical debt and refactoring needs

You have read-only access and provide advisory input only." \
  --allowedTools "Read" "Grep" "Glob" "LS" "mcp__squabble__save_decision" \
  --disallowedTools "Write" "Edit" "MultiEdit" "Bash" "mcp__squabble__*_tasks"
```

## Tool Permissions by Role

### Engineer Tools
| Tool | Permission | Purpose |
|------|------------|---------|
| `init_workspace` | ✅ Allowed | Initialize Squabble projects |
| `consult_pm` | ✅ Allowed | Discuss with PM |
| `get_next_task` | ✅ Allowed | Find tasks to work on |
| `claim_task` | ✅ Allowed | Mark tasks as in-progress |
| `submit_for_review` | ✅ Allowed | Submit work for PM review |
| `propose_modification` | ✅ Allowed | Suggest task changes |
| `save_decision` | ✅ Allowed | Document decisions |
| `pm_update_tasks` | ❌ **Blocked** | PM-only task management |

### PM Tools
| Tool | Permission | Purpose |
|------|------------|---------|
| All Engineer tools | ✅ Allowed | Full access |
| `pm_update_tasks` | ✅ **Allowed** | Manage task list |

### Specialist Tools
| Tool | Permission | Purpose |
|------|------------|---------|
| `Read`, `Grep`, `Glob`, `LS` | ✅ Allowed | Investigation |
| `WebSearch`, `WebFetch` | ✅ Allowed | Research |
| `save_decision` | ✅ Allowed | Document recommendations |
| `consult_pm` | ✅ Allowed | Provide findings |
| All write operations | ❌ Blocked | Read-only role |
| All task management | ❌ Blocked | Advisory only |

## Error Messages

When permissions are denied, you'll see helpful error messages:

```bash
# Engineer trying to use PM tools
> pm_update_tasks(...)
Error: Engineers cannot directly update tasks. Use propose_modification to suggest changes to the PM.

# Specialist trying to write
> Edit(...)
Error: Specialists have read-only access. Contact the engineer or PM for modifications.
```

## Workflow Examples

### Example 1: Engineer Proposing New Task
```javascript
// ❌ Wrong way - Engineer directly modifying tasks
pm_update_tasks({
  modifications: [{type: "ADD", ...}]
})
// Error: Engineers cannot directly update tasks

// ✅ Correct way - Engineer proposing through PM
propose_modification({
  reason: "Need to add error handling",
  modifications: [{type: "ADD", ...}]
})
// Success: Proposal sent to PM for approval
```

### Example 2: PM Managing Tasks
```javascript
// PM can directly update tasks
pm_update_tasks({
  modifications: [
    {type: "ADD", reason: "New requirement", ...},
    {type: "MODIFY", taskId: "SQBL-1", ...}
  ]
})
// Success: Updated 2 tasks
```

### Example 3: Security Review
```javascript
// Security specialist reviews code
Read("src/auth/login.ts")
Grep({pattern: "password", path: "src/"})

// Provides findings via decision
save_decision({
  type: "security",
  title: "Authentication Security Review",
  description: "Found potential issues with password handling",
  rationale: "Passwords should be hashed with bcrypt, not stored in plain text"
})
```

## Best Practices

1. **Start with the right mode**: Set `SQUABBLE_MODE` when launching the MCP server
2. **Use specific permission flags**: When spawning agents, be explicit about allowed/disallowed tools
3. **Follow the workflow**: Engineers propose, PMs approve and apply
4. **Document decisions**: Use `save_decision` to capture important choices
5. **Keep specialists focused**: They should advise, not implement

## Troubleshooting

### PM Can't Update Tasks
- Ensure MCP server is running with `SQUABBLE_MODE=pm`
- Check that PM was spawned with `--allowedTools "mcp__squabble__*"`

### Engineer Blocked from Normal Tools
- Check if `--disallowedTools` is too restrictive
- Ensure you're not in specialist mode

### Specialist Needs More Access
- Consider if they really need write access
- If yes, spawn as engineer with specific context instead

## Security Considerations

1. **Defense in depth**: Server-side validation backs up CLI flags
2. **Audit trail**: All task modifications are logged with actor and timestamp
3. **Least privilege**: Each role has minimum necessary permissions
4. **Explicit over implicit**: Permission denials include helpful guidance

## Future Enhancements

- [ ] Project-specific permission overrides
- [ ] Temporary permission elevation
- [ ] Role-based audit logs
- [ ] Permission templates for common scenarios