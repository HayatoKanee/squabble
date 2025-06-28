# Local Testing Guide for Squabble

## Option 1: Direct Path Testing

```bash
# Add Squabble using the local path
claude mcp add squabble "node /Users/hayatokane/Desktop/squabble/dist/mcp-server/server.js"
```

## Option 2: NPM Link (Recommended for Development)

```bash
# In the squabble directory
npm link

# This creates a global symlink, then you can use:
claude mcp add squabble "squabble-mcp"
```

## Option 3: Direct NPX with Local Path

```bash
# For testing the npx flow
claude mcp add squabble "npx file:/Users/hayatokane/Desktop/squabble"
```

## Testing the MCP Server

Once added, in any project directory:

1. Open Claude Code
2. You now have access to Squabble tools as the PM
3. Example workflow:
   ```
   User: "I need to build a payment processing system"
   
   You (as PM): Let me understand your requirements...
   [Use spawn_agent tool to create specialists]
   [Use send_to_agent to facilitate debates]
   [Use update_tasks to manage task list]
   ```

## Troubleshooting

If you encounter issues:

1. Check Claude's MCP config:
   ```bash
   cat ~/.config/claude/mcp.json
   ```

2. View server logs:
   - MCP servers log to stderr
   - Check Claude's logs for error messages

3. Test the server directly:
   ```bash
   node dist/mcp-server/server.js
   ```
   (Should see "Squabble MCP Server started successfully")

## Publishing to NPM

When ready to publish:

```bash
# Login to npm
npm login

# Publish
npm publish --access public

# Then users can use:
claude mcp add squabble "npx -y @squabble/mcp-server"
```