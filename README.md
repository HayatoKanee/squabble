# Squabble - AI Agents That Debate Before They Code

> "Better to debate for an hour than refactor for a week."

Squabble is an MCP (Model Context Protocol) server for Claude that transforms AI-assisted development from hasty code generation to thoughtful engineering. It orchestrates deliberate debates between specialized AI agents, ensuring every line of code is production-ready.

## The Problem We Solve

Current AI coding assistants rush to implement without understanding requirements, creating toy examples that need complete rewrites. Squabble provides MCP tools that enable you (as PM) to spawn specialist agents, orchestrate debates, and ensure thorough analysis before any code is written.

## Installation

### Quick Install (Recommended)

```bash
# Add Squabble to Claude Code
claude mcp add squabble "npx -y @squabble/mcp-server"
```

### Manual Installation

1. Install globally:
```bash
npm install -g @squabble/mcp-server
```

2. Add to Claude's MCP configuration:
```json
{
  "mcpServers": {
    "squabble": {
      "command": "squabble-mcp"
    }
  }
}
```

## Usage

Squabble provides MCP tools that you (acting as PM) use to manage specialist agents and orchestrate development debates.

### Available Tools

When Claude Code has Squabble installed, you have access to these tools:

1. **spawn_agent** - Create a specialist agent (engineer, security, architect)
2. **send_to_agent** - Send messages to spawned agents
3. **update_tasks** - Manage the project task list (add, delete, modify, block, split)
4. **save_decision** - Document architectural decisions
5. **get_agent_status** - Check status of all spawned agents
6. **debate_status** - Get project debate overview

### Example PM Workflow

As the PM using Claude Code with Squabble:

```
User: "I need to add cryptocurrency payments to our e-commerce site"

You (as PM): Let me understand your requirements better:
- Which cryptocurrencies?
- Transaction volume?
- Compliance requirements?

[After clarification, you spawn specialists using Squabble tools]

spawn_agent:
  role: "engineer"
  context: "E-commerce site adding crypto payments for BTC/ETH, 100tx/day"
  initialQuestion: "What's the best integration approach for crypto payments?"

spawn_agent:
  role: "security"
  context: "Crypto payment integration for e-commerce"
  initialQuestion: "What security concerns should we address?"

[You facilitate debate between specialists]

send_to_agent:
  role: "engineer"
  message: "Security raised concerns about key management. Your thoughts?"

[You synthesize findings and update tasks]

update_tasks:
  modifications: [
    { type: "ADD", reason: "Security requirement", 
      details: { title: "Implement secure key management", priority: "high" }}
  ]
```

## How It Works

1. **You are the PM**: Claude acts as the PM, using Squabble tools to manage specialists
2. **Tool-Based Orchestration**: MCP tools let you spawn agents, send messages, and manage tasks
3. **Context Isolation**: Each specialist maintains its own Claude session for pure perspective
4. **Dynamic Task Management**: Task list evolves based on specialist insights
5. **Workspace Management**: `.squabble/` folder in your project tracks all decisions

## Project Structure

When initialized, Squabble creates:

```
your-project/
└── .squabble/
    ├── workspace/
    │   ├── requirements/   # Evolving requirement docs
    │   ├── designs/       # Architecture proposals
    │   ├── decisions/     # Decision records
    │   ├── tasks/        # Dynamic task list
    │   └── debates/      # Debate transcripts
    └── sessions/         # Agent session tracking
```

## Philosophy

Squabble embodies the principle that the best code is code you don't have to rewrite. By forcing upfront analysis and debate, we catch issues during design rather than in production.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Contributing

We welcome contributions! Please ensure any PR follows our philosophy of thoughtful analysis before implementation.

## License

MIT

---

Built with the belief that AI assistants should think before they code.