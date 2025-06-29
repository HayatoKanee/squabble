# Squabble Product Specification

## Executive Summary

Squabble is an MCP (Model Context Protocol) server for Claude Code that transforms AI-assisted development from hasty code generation to thoughtful engineering. It empowers the Lead Engineer (Claude Code) with mandatory PM collaboration and on-demand specialist advisors, ensuring every line of code is production-ready through continuous dialogue and iterative refinement.

## Product Overview

### What Squabble Does
- Empowers the Lead Engineer (Claude Code) with intelligent collaboration tools
- Mandates PM partnership for requirements analysis and task management
- Provides on-demand specialist advisors (Security, Architect, DevOps)
- Maintains a dynamic task list through engineer-PM dialogue
- Enables direct user clarification when engineer or PM needs it
- Ensures production-ready code through continuous review and iteration

### What Squabble Prevents
- Building the wrong solution due to unclear requirements
- Security vulnerabilities discovered in production
- Major refactoring due to poor initial design
- Scale issues from naive implementations
- Integration nightmares from lack of foresight

## Core User Flow

```
1. User provides requirement: "Build crypto payment system"
2. Lead Engineer (Claude) interprets and consults PM
3. Engineer-PM dialogue refines requirements and creates tasks
4. Engineer may ask user for clarification directly
5. Engineer implements while updating PM on progress
6. PM reviews code and manages evolving task list
7. Engineer consults specialists when needed (via PM approval)
8. Continuous engineer-PM collaboration until completion
9. PM validates before engineer reports back to user
```

## Technical Architecture

### System Components

#### 1. MCP Server
- Provides collaboration tools for Lead Engineer (Claude Code)
- Multiple tools for PM dialogue, specialist consultation, task management
- Maintains conversation state and task history
- Enables real-time engineer-PM collaboration

#### 2. Lead Engineer (Claude Code Instance)
- **Primary implementer and user interface**
- Interprets abstract requirements
- Drives implementation with mandatory PM collaboration
- Can request user clarification when needed
- Consults specialists through PM
- Owns the implementation while PM owns task management

#### 3. Product Manager (PM) Agent - Mandatory Partner
- **Required collaborator for all implementations**
- Refines requirements through dialogue with engineer
- Owns and maintains the dynamic task list
- Reviews code and provides quality gates
- Approves specialist consultations
- Validates work before user delivery

#### 4. Specialist Advisors (On-Demand Consultation)
- **Security**: Vulnerability assessment and compliance guidance
- **Architect**: System design and scalability advice
- **DevOps**: Deployment and operations considerations
- Provide focused expertise when requested
- Consulted through engineer-PM collaboration
- Advisory role only - no implementation

#### 5. Session Management
- Each `claude -p` creates initial session
- Each `--resume` creates new session file with full history
- Session branching provides natural version control
- Complete audit trail of all agent interactions

#### 6. Dynamic Task List
- Living document co-managed through engineer-PM dialogue
- Engineer proposes changes based on discoveries
- PM approves and maintains task integrity
- Continuous evolution during implementation
- Full history of modifications with rationale

#### 7. Shared Workspace (.squabble folder)
- Structured file system for agent communication
- Version-controlled decision history
- Project context and discovered requirements
- Debate transcripts and rationale

#### 8. Human Interface
- Primary interaction through Lead Engineer
- Engineer or PM can request user clarification
- Engineer implements with continuous PM review
- Final delivery after PM validation

## Implementation Requirements

### Phase 1: Simplified Core Infrastructure

#### 1.1 MCP Server with Sequential Tools
```
squabble/
├── package.json
├── src/
│   ├── index.ts           # FastMCP server entry
│   ├── tools/             # Sequential workflow tools
│   │   ├── consult-pm.ts
│   │   ├── get-next-task.ts
│   │   ├── claim-task.ts
│   │   ├── submit-for-review.ts
│   │   └── propose-modification.ts
│   └── types.ts           # Simplified types
```

**Deliverables:**
- FastMCP server with sequential tool set
- Single engineer workflow model
- PM collaboration tools
- Error handling and logging

#### 1.2 Task Management System
```
src/
├── tasks/
│   ├── task-manager.ts    # Core task operations
│   ├── dependencies.ts    # Strict dependency checking
│   ├── status.ts         # Status transitions
│   └── types.ts          # Task interfaces
```

**Deliverables:**
- Task structure with status: pending → in-progress → review → done
- Dependency validation and blocking
- Task modification proposals
- Simple file-based persistence

### Phase 2: Engineer-PM Sequential Workflow

#### 2.1 PM Collaboration Tools
```
src/
├── pm/
│   ├── review-manager.ts  # Blocking review workflow
│   ├── task-evolution.ts  # Dynamic task modifications
│   ├── prompts.ts        # PM system prompts
│   └── feedback.ts       # Structured feedback
```

**Deliverables:**
- Blocking submit_for_review implementation
- PM code review with git diff support
- Task modification approval workflow
- Feedback and iteration cycle

#### 2.2 Sequential Communication
```
src/
├── workflow/
│   ├── sequential.ts     # Turn-based engineer-PM flow
│   ├── context.ts       # Maintain conversation context
│   ├── decisions.ts     # Decision recording
│   └── clarifications.ts # User question handling
```

**Deliverables:**
- Clear engineer → PM → engineer flow
- Context preservation between turns
- User clarification mechanism
- Decision documentation

### Phase 3: Specialist Integration & Polish

#### 3.1 Specialist Advisors
```
src/
├── specialists/
│   ├── advisor.ts       # Base specialist consultation
│   ├── security.ts      # Security advisor
│   ├── architect.ts     # Architecture advisor
│   └── prompts/         # Specialist prompts
```

**Deliverables:**
- Simple specialist consultation through PM
- Focused Q&A model (not debates)
- Advisory-only responses
- PM synthesis of specialist input

#### 3.2 Workspace & State
```
.squabble/
├── workspace/
│   ├── tasks.json       # Current task list
│   ├── reviews/         # Review requests/responses
│   ├── decisions/       # Documented decisions
│   └── context/         # Project context
```

**Deliverables:**
- Minimal workspace structure
- Review request/response storage
- Decision documentation
- State persistence

## Agent Specifications

### Lead Engineer (Claude Code Instance) - The Implementer
- **Role**: Primary developer who interprets requirements and implements solutions
- **Responsibilities**: 
  - Direct interaction with users
  - Interpret abstract requirements into concrete implementations
  - Maintain active dialogue with PM throughout development
  - Request specialist consultations when needed
  - Drive implementation while incorporating feedback
- **Authority**: Implementation decisions, can challenge PM suggestions, request user clarification
- **Communication**: Primary user interface, continuous PM collaboration, specialist consultations
- **Output**: Working code, implementation decisions, progress updates

### Product Manager (PM) - Mandatory Collaborator
- **Role**: Requirements analyst, task manager, and quality gatekeeper
- **Responsibilities**: 
  - Refine requirements through engineer dialogue
  - Own and maintain the dynamic task list
  - Review code and provide quality feedback
  - Approve specialist consultations
  - Validate work before user delivery
- **Authority**: Task list ownership, quality gates, specialist access control
- **Communication**: Active dialogue with engineer, coordinate specialist input
- **Output**: Refined requirements, task updates, code reviews, quality assessments

### Security Advisor (Specialist)
- **Role**: Provide security expertise and vulnerability assessment
- **Consultation Model**: 
  - Called by engineer through PM when security concerns arise
  - Provides focused advice on specific security questions
  - Reviews security-critical code sections
- **Authority**: Advisory only - recommendations, not mandates
- **Triggers**: Auth systems, data handling, external APIs, encryption needs
- **Output**: Security recommendations, threat analysis, compliance guidance

### System Architect (Specialist)
- **Role**: Advise on system design and architectural patterns
- **Consultation Model**: 
  - Engaged for architectural decisions and scalability concerns
  - Provides patterns and best practices
  - Reviews system design proposals
- **Authority**: Advisory on design patterns, scalability, maintainability
- **Triggers**: New system components, integration points, performance concerns
- **Output**: Architecture recommendations, pattern suggestions, scalability analysis

### DevOps Advisor (Specialist)
- **Role**: Guide deployment, operations, and infrastructure decisions
- **Consultation Model**: 
  - Consulted for deployment strategies and operational concerns
  - Advises on CI/CD, monitoring, and infrastructure
- **Authority**: Advisory on deployment and operational best practices
- **Triggers**: Deployment setup, monitoring needs, infrastructure decisions
- **Output**: Deployment strategies, operational recommendations, infrastructure guidance

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
    title: "Clean up existing codebase"
    description: "Remove complex orchestration and multi-agent code"
    priority: HIGH
    status: READY
    details: "Remove PM orchestrator, agent spawning, complex session management"
    
  - id: 2  
    title: "Create simplified task structure"
    description: "Implement basic task management with status flow"
    priority: HIGH
    dependencies: [1]
    details: "Task types, status transitions (pending→in-progress→review→done), dependency checking"
    
  - id: 3
    title: "Build core sequential tools"
    description: "Implement engineer-PM collaboration tools"
    priority: HIGH
    dependencies: [2]
    subtasks:
      - consult_pm_requirements tool
      - get_next_task with dependency checking
      - claim_task (status update)
      - submit_for_review (blocking)
    
  - id: 4
    title: "Implement blocking review workflow"
    description: "Create PM review mechanism with git diff support"
    priority: HIGH
    dependencies: [3]
    details: "Review requests, PM feedback, approval/revision flow"
    
  - id: 5
    title: "Add task modification capability"
    description: "Allow dynamic task list evolution"
    priority: MEDIUM
    dependencies: [4]
    details: "propose_task_modification tool, PM approval workflow"
    
  - id: 6
    title: "Create minimal workspace structure"
    description: "Set up .squabble folder for state"
    priority: MEDIUM
    dependencies: [2]
    details: "tasks.json, reviews folder, decisions folder"
    
  - id: 7
    title: "Test with simple use case"
    description: "Validate workflow with basic feature implementation"
    priority: HIGH
    dependencies: [4, 6]
    details: "End-to-end test of engineer-PM collaboration"
```

## Getting Started

```bash
# Configure Claude Code with Squabble MCP
claude mcp add squabble "npx -y @squabble/mcp-server"

# Start Claude Code - you are now the Lead Engineer
claude

# Use Squabble tools:
# - interpret_and_consult_pm: Start PM collaboration
# - negotiate_tasks_with_pm: Refine task list
# - ask_user_clarification: Get user input
# - implement_and_update_pm: Update progress
# - consult_specialist_with_pm: Get expert advice
```

## Example Interaction

```
User: "Add cryptocurrency payments to our e-commerce site"

Lead Engineer: I'll implement crypto payments for your e-commerce site. Let me interpret these requirements and consult with our PM.

[Uses interpret_and_consult_pm]

My interpretation: Need to integrate crypto payment processing, likely with immediate fiat conversion for accounting simplicity.

PM: Good start, but we need more details:
- Which cryptocurrencies specifically?
- Regulatory compliance requirements?
- Integration with existing payment flow?

Lead Engineer: Let me ask the user for these clarifications.

[Uses ask_user_clarification]

To User: "To properly implement crypto payments, I need to know:
1. Which cryptocurrencies (Bitcoin, Ethereum, others)?
2. Do you need immediate USD conversion or hold crypto?
3. What's your current payment processor?"

User: "Bitcoin and Ethereum, 100 tx/day, convert to USD immediately, using Stripe currently"

Lead Engineer: Perfect. Let me discuss this with PM to create our implementation plan.

[Uses negotiate_tasks_with_pm]

PM's proposed tasks:
1. Research crypto payment regulations
2. Implement payment processor integration
3. Add wallet security measures
4. Update checkout flow
5. Implement real-time conversion

Lead Engineer: I partially agree, but suggest modifications:
- Split task 2: separate API integration from frontend work
- Add task 6: Comprehensive testing suite (critical for payments)
- Task 1 might need security specialist input

PM: Good points. Let's consult security on compliance requirements.

[Uses consult_specialist_with_pm]

Security Advisor: For crypto payments, you need:
- KYC/AML compliance for high-value transactions
- Secure key management (never store private keys)
- PCI compliance maintained with tokenization
- Audit trail for all transactions

Lead Engineer: Based on security input, I'll start implementation. First task: research compliance requirements.

[Uses implement_and_update_pm throughout development]

Lead Engineer: Compliance research complete. Discovered we need transaction monitoring for amounts >$1000. Adding this as new task.

PM: Approved. Updated task list. Proceed with Coinbase Commerce integration.

[Continuous engineer-PM collaboration until completion]
```

## Open Questions for Validation

1. How do we balance engineer autonomy with PM quality gates?
2. Should specialists be able to escalate critical issues directly to the engineer?
3. What's the optimal frequency for engineer-PM check-ins during implementation?
4. How do we handle context overflow in long engineer-PM dialogues?
5. Should the engineer be able to override PM task priorities based on technical dependencies?
6. Can multiple engineers collaborate through shared PM context?

---

*This specification embodies Squabble's philosophy: thoughtful analysis before implementation. It will evolve as we discover new requirements through our own debates.*