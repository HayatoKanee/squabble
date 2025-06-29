# Squabble: AI Agents That Debate Before They Code

> Engineer-driven development with critical-thinking PM collaboration

## Installation

```bash
# Using npm
npm install -g squabble-mcp

# Or using Claude Code
claude mcp add npm squabble-mcp
```

## Quick Start

```bash
# In Claude Code, after installation:
init_workspace
```

---

> "Why did you give me a toy example? I asked for production-ready code!"

Sound familiar? If you've used Claude Code or other AI coding assistants, you've probably experienced:

- **Hasty MVP implementations** that need complete rewrites
- **Toy examples** when you needed production code  
- **Over-engineered solutions** when you wanted a simple POC
- **Wrong assumptions** about your tech stack or requirements
- **Mock implementations** that don't actually work
- **Constant monitoring** to keep the AI on track

Even with plan mode, AI assistants rush to code with minimal thinking. You end up spending more time correcting course than if you'd coded it yourself.

## The Problem

Current AI coding assistants suffer from:

1. **Eager coding syndrome** - They start writing before understanding
2. **Poor requirement analysis** - Missing critical details and context  
3. **No self-critique** - First solution becomes the only solution
4. **Static task management** - Can't adapt as requirements evolve
5. **Isolation** - No way to get specialized perspectives

You've probably found yourself:
- Chatting with Gemini/ChatGPT first to clarify requirements
- Manually inspecting every piece of generated code
- Repeatedly saying "That's not what I wanted"
- Watching the AI ignore your carefully written documentation

Tools like claude-task-master help, but they rely on external LLMs that don't know your actual project status and can't have clear conversations with you. The task list remains static and disconnected.

## Enter Squabble

Squabble forces AI to **think before coding** through structured debates between specialized agents:

```
User Request → PM analyzes → Specialists debate → Consensus reached → THEN code
```

### How It Works

1. **Product Manager (PM)** - You (Claude) with MCP tools to orchestrate
2. **Specialist Agents** - Domain experts who challenge assumptions:
   - **Engineer** - Implementation feasibility and technical approach
   - **Security** - Vulnerabilities and security considerations  
   - **Architect** - System design and scalability

Before ANY code is written:
- Requirements are debated and clarified
- Multiple approaches are considered
- Assumptions are explicitly challenged
- Trade-offs are documented
- Consensus is reached

### Real Example

**Without Squabble:**
```
User: "Add user authentication to my app"
AI: *Immediately writes basic auth with hardcoded users*
User: "No, I need JWT with refresh tokens, rate limiting, and OAuth support"
AI: *Rewrites everything*
```

**With Squabble:**
```
User: "Add user authentication to my app"
PM: "Let me clarify requirements first..."
*spawns specialists*
Security: "What threat model? Session management needs?"
Architect: "Existing auth systems? Scale requirements?"
Engineer: "Tech stack constraints? Third-party services?"
*debate continues until requirements are crystal clear*
PM: "Based on our analysis, here are three approaches..."
```

## Installation

```bash
# Quick install (Recommended)
claude mcp add squabble "npx -y @squabble/mcp-server"

# Or install globally
npm install -g @squabble/mcp-server
claude mcp add squabble
```


## Technical Architecture

```
┌─────────┐     ┌────────────┐     ┌─────────────┐
│  User   │────▶│ PM (Claude)│────▶│ Specialists │
└─────────┘     │  with MCP  │     ├─────────────┤
                └────────────┘     │  Engineer   │
                      │            │  Security   │
                      ▼            │  Architect  │
                ┌──────────┐       └─────────────┘
                │.squabble/│
                │workspace │
                └──────────┘
```

### Project Structure

```
your-project/
├── .claude/
│   └── settings.local.json  # Background task config
├── CLAUDE.md               # Context-aware role detection
└── .squabble/
    ├── workspace/
    │   ├── requirements/   # Evolving requirements
    │   ├── designs/       # Architecture proposals
    │   ├── decisions/     # ADRs (Architecture Decision Records)
    │   ├── tasks/        # Dynamic task tracking
    │   ├── debates/      # Specialist discussions
    │   └── context/      # Project metadata
    ├── sessions/         # Agent conversation tracking
    └── archive/         # Completed debates
```

## Why Squabble?

Because AI should **debate and think** before it codes. Just like a good development team would.

Stop babysitting AI code generation. Let specialists argue it out first, then get it right the first time.

## Development

```bash
# Clone the repository
git clone https://github.com/squabble-org/squabble.git
cd squabble

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

We welcome contributions! The goal is simple: make AI think harder before coding.

Areas we'd love help with:
- Additional specialist roles (DevOps, UX, Data)
- Integration with more AI platforms
- Better debate facilitation strategies
- Task management improvements

## License

MIT - Because good ideas should be free to improve

---

*Built by developers tired of "MVP-first, think-later" AI coding*

**Remember:** The best code is code you don't have to rewrite. Let them squabble first.