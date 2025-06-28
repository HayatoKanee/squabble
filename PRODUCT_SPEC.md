# Squabble Product Specification

## Executive Summary

Squabble is an MCP (Model Context Protocol) server for Claude Code that transforms AI-assisted development from hasty code generation to thoughtful engineering. It orchestrates deliberate debates between specialized AI agents, ensuring every line of code is production-ready through rigorous pre-implementation analysis.

## Product Overview

### What Squabble Does
- Spawns multiple specialized Claude agents (PM, Engineer, Security, Architect)
- Facilitates structured debates about requirements and design before coding
- Maintains a living task list that evolves based on discoveries
- Provides human-in-the-loop intervention points
- Ensures production-ready code through adversarial review

### What Squabble Prevents
- Building the wrong solution due to unclear requirements
- Security vulnerabilities discovered in production
- Major refactoring due to poor initial design
- Scale issues from naive implementations
- Integration nightmares from lack of foresight

## Core User Flow

```
1. User runs: squabble init "Build crypto payment system"
2. PM agent spawns and interrogates requirements
3. User provides clarifications to PM
4. PM spawns relevant specialists (Engineer, Security, etc.)
5. PM facilitates debate between specialists
6. PM synthesizes findings and presents to user
7. User approves approach through PM
8. PM maintains dynamic task list throughout
9. Implementation proceeds with PM oversight
```

## Technical Architecture

### System Components

#### 1. MCP Server
- Entry point for Claude Code integration
- Single tool interface: `squabble_session`
- Routes all requests to PM agent
- Maintains session state

#### 2. Product Manager (PM) Agent - The Orchestrator
- **ONLY agent that interacts with users**
- **ONLY agent that can spawn other specialists**
- Manages all agent lifecycles
- Owns and maintains the dynamic task list
- Synthesizes specialist feedback for users
- Makes final decisions on approach

#### 3. Specialist Agents (Spawned by PM only)
- **Engineer**: Technical feasibility and implementation
- **Security**: Vulnerability assessment and compliance
- **Architect**: System design and scalability
- Cannot spawn other agents (prevents recursion)
- Cannot interact with users directly
- Report only to PM

#### 4. Session Management
- Each `claude -p` creates initial session
- Each `--resume` creates new session file with full history
- Session branching provides natural version control
- Complete audit trail of all agent interactions

#### 5. Dynamic Task List
- Living document owned by PM
- PM modifies based on specialist input
- Maintains modification history with rationale
- Enforces dependencies and blockers

#### 6. Shared Workspace (.squabble folder)
- Structured file system for agent communication
- Version-controlled decision history
- Project context and discovered requirements
- Debate transcripts and rationale

#### 7. Human Interface
- All interaction through PM agent
- PM requests clarification when needed
- PM presents synthesized team recommendations
- Human approvals go through PM

## Implementation Requirements

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 MCP Server Setup
```
squabble/
├── package.json
├── src/
│   ├── mcp-server.ts      # MCP protocol implementation
│   ├── tools/             # MCP tool definitions
│   └── index.ts           # Server entry point
```

**Deliverables:**
- Basic MCP server responding to tool calls
- `squabble_session` tool with start/status/intervene actions
- Error handling and logging
- Configuration management

#### 1.2 Agent Management System
```
src/
├── agents/
│   ├── orchestrator.ts    # Agent lifecycle management
│   ├── session-manager.ts # UUID persistence
│   ├── prompts/          # System prompts per role
│   └── types.ts          # Agent interfaces
```

**Deliverables:**
- Agent spawning with Claude CLI integration
- Session UUID management and persistence
- Inter-agent communication protocol
- Agent health monitoring

### Phase 2: PM-Centric Orchestration (Week 3-4)

#### 2.1 PM Agent Implementation
```
src/
├── pm/
│   ├── orchestrator.ts   # PM main logic
│   ├── decision-parser.ts # Parse PM decisions
│   ├── specialist-manager.ts # Spawn/manage specialists
│   └── synthesis.ts      # Synthesize specialist input
```

**Deliverables:**
- PM agent with user interaction capability
- Specialist spawning logic (PM-only)
- Decision parsing from PM responses
- User-friendly synthesis of technical debates

#### 2.2 Dynamic Task Management
```
src/
├── tasks/
│   ├── task-list.ts      # Living task list
│   ├── modifications.ts  # Modification protocol
│   ├── validation.ts     # Change validation
│   └── persistence.ts    # Task state storage
```

**Deliverables:**
- Task CRUD operations with history
- Agent-driven modification protocol
- Dependency and blocker management
- Task state visualization

### Phase 3: Workspace & Integration (Week 5-6)

#### 3.1 Shared Workspace
```
.squabble/
├── workspace/
│   ├── requirements/     # Evolving requirements
│   ├── designs/         # Architecture proposals
│   ├── decisions/       # ADRs and rationale
│   ├── tasks/          # Current task state
│   ├── debates/        # Active discussions
│   └── context/        # Project knowledge
```

**Deliverables:**
- Workspace initialization on `squabble init`
- File-based agent communication
- Conflict resolution mechanisms
- Workspace state management

#### 3.2 Human Integration Layer
```
src/
├── human/
│   ├── interface.ts     # Human interaction points
│   ├── approvals.ts     # Approval workflows
│   ├── escalation.ts    # Escalation rules
│   └── ui/             # Terminal UI components
```

**Deliverables:**
- Interactive prompts for clarification
- Approval request system
- Real-time debate monitoring
- Manual intervention capabilities

## Agent Specifications

### Product Manager (PM) - The Orchestrator
- **Role**: Single point of contact for users, orchestrates all specialists
- **Unique Abilities**: 
  - Only agent that interacts with users
  - Only agent that can spawn other agents
  - Owns and modifies the dynamic task list
  - Synthesizes all specialist feedback
- **Authority**: Final decision maker, can override specialist recommendations
- **Communication**: Direct with user, facilitates all specialist debates
- **Output**: Synthesized recommendations, updated task lists, clear action plans

### Security Engineer (Specialist)
- **Role**: Identify vulnerabilities before implementation
- **Limitations**: 
  - Cannot interact with users
  - Cannot spawn other agents
  - Reports only to PM
- **Authority**: Recommend security requirements, flag risks
- **Triggers**: Spawned by PM for auth systems, data handling, external integrations
- **Output**: Threat models, security requirements to PM

### System Architect (Specialist)
- **Role**: Design scalable, maintainable solutions
- **Limitations**: 
  - Cannot interact with users
  - Cannot spawn other agents
  - Reports only to PM
- **Authority**: Propose architectures, identify technical debt
- **Triggers**: Spawned by PM for system design decisions
- **Output**: Architecture proposals, tradeoff analysis to PM

### Senior Engineer (Specialist)
- **Role**: Implementation feasibility and best practices
- **Limitations**: 
  - Cannot interact with users
  - Cannot spawn other agents
  - Reports only to PM
- **Authority**: Assess technical feasibility, propose implementations
- **Triggers**: Spawned by PM for implementation planning
- **Output**: Technical assessments, implementation approaches to PM

## Success Criteria

### Functional Requirements
- [ ] Spawn and manage multiple Claude agents via CLI
- [ ] Maintain isolated agent contexts with session persistence
- [ ] Enable structured multi-agent debates
- [ ] Support dynamic task list modifications by agents
- [ ] Provide human intervention capabilities
- [ ] Generate comprehensive decision documentation

### Performance Requirements
- Agent spawn time < 3 seconds
- Debate rounds complete within 5 minutes
- Task modifications applied immediately
- Human prompts timeout gracefully
- Support concurrent agent operations

### Quality Requirements
- 80% reduction in requirement misunderstandings
- 90% of security issues caught before implementation
- All architectural decisions documented with rationale
- Complete audit trail of task evolution
- Clear escalation paths for deadlocks

## Development Approach

Following our own philosophy, Squabble will be built using Squabble principles:

1. **Start with manual simulation** - Run debates manually before automating
2. **Incremental implementation** - Each phase delivers working functionality
3. **Continuous validation** - Test with real development scenarios
4. **Evolving requirements** - This spec will change based on discoveries

## Initial Implementation Tasks

```yaml
tasks:
  - id: 1
    title: "Set up basic MCP server structure"
    priority: HIGH
    status: READY
    
  - id: 2  
    title: "Implement squabble init command"
    priority: HIGH
    dependencies: [1]
    
  - id: 3
    title: "Create agent spawning mechanism"
    priority: HIGH
    dependencies: [1]
    
  - id: 4
    title: "Design shared workspace structure"
    priority: MEDIUM
    dependencies: [2]
    
  - id: 5
    title: "Implement PM agent with basic interrogation"
    priority: HIGH
    dependencies: [3]
```

## Getting Started

```bash
# Install Squabble
npm install -g @squabble/cli

# Initialize a Squabble session (spawns PM agent)
squabble init "Your project requirement"

# Continue conversation with PM
squabble continue "Here's more context..."

# Check current status (PM reports team progress)
squabble status

# All commands go through PM - no direct specialist access
```

## Example Interaction

```
$ squabble init "Add cryptocurrency payments to our e-commerce site"

PM: I need to understand your requirements better:
1. Which cryptocurrencies do you want to support?
2. What's your expected transaction volume?
3. Do you need fiat conversion or hold crypto?
4. What's your current payment infrastructure?

$ squabble continue "Bitcoin and Ethereum, 100 tx/day, convert to USD immediately, using Stripe currently"

PM: Let me consult with our specialists on this...
[PM spawns Engineer and Security agents in background]

PM: Based on our team's analysis:
- Engineer recommends using Coinbase Commerce for easy Stripe integration
- Security flagged the need for proper wallet management and compliance
- Estimated effort: 2 weeks with proper testing

Here's the proposed task breakdown:
1. Research crypto payment regulations (HIGH priority)
2. Implement Coinbase Commerce integration
3. Add wallet security measures
4. Update checkout flow
5. Implement real-time conversion

Shall we proceed with this approach?
```

## Open Questions for Validation

1. Should PM have a configurable "debate depth" to prevent over-analysis?
2. How does PM handle specialist disagreements that can't be resolved?
3. Should PM be able to spawn specialized sub-PMs for large projects?
4. What's the optimal context window management for long conversations?
5. How do we handle PM session recovery after failures?

---

*This specification embodies Squabble's philosophy: thoughtful analysis before implementation. It will evolve as we discover new requirements through our own debates.*