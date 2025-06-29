# Squabble Cleanup Plan

## Phase 1: Remove Multi-Agent Orchestration

### Files to DELETE:
```bash
# PM orchestration
rm src/pm/orchestrator.ts
rm src/pm/session-manager.ts
rm src/pm/decision-parser.ts
rm src/pm/task-manager.ts

# Agent management
rm src/agents/session-manager.ts

# Multi-agent tools
rm src/tools/spawn-agent.ts
rm src/tools/send-to-agent.ts
rm src/tools/get-agent-status.ts
rm src/tools/debate-status.ts
rm src/tools/squabble-session.ts
```

### Files to MODIFY:

#### 1. `/src/types.ts` - Simplify types
- Remove: AgentRole, SpecialistRole, AgentSession, DebateContext, DebateRound, PMDecision
- Simplify: Task (remove proposedBy, createdBy, assignee)
- Simplify: TaskModification (remove proposedBy)
- Simplify: Decision (remove proposedBy, supportedBy)

#### 2. `/src/index.ts` - Simplify server
- Remove SessionManager import and usage
- Remove all agent-related tool registrations
- Keep only workspace and task management

#### 3. `/src/tools/index.ts` - Update tool registration
- Remove all agent-related tool imports
- Keep only: initWorkspace, updateTasks, saveDecision

#### 4. `/src/workspace/manager.ts` - Remove agent methods
- Remove: saveAgentSession, getAgentSession
- Remove: saveDebate, getDebate
- Keep: task, decision, and context methods

## Phase 2: Create New Sequential Structure

### New Files to CREATE:
```
src/
├── tools/
│   ├── consult-pm.ts         # Initial PM consultation
│   ├── get-next-task.ts      # Task selection with dependencies
│   ├── claim-task.ts         # Update task status
│   ├── submit-for-review.ts  # Blocking PM review
│   └── propose-modification.ts # Task list changes
└── pm/
    ├── review-manager.ts     # PM review workflow
    └── prompts.ts           # PM system prompts
```

### Simplified Types:
```typescript
// New simplified types
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  blockedBy?: string;
}

export interface ReviewRequest {
  taskId: string;
  summary: string;
  filesChanged: string[];
  gitDiff?: string;
  timestamp: Date;
}

export interface PMFeedback {
  approved: boolean;
  feedback: string;
  requiredChanges?: string[];
  taskModifications?: TaskModification[];
}
```

## Phase 3: Test & Validate

1. Ensure MCP server starts without errors
2. Test basic task operations
3. Implement minimal PM consultation
4. Validate sequential workflow

## Execution Order:

1. **Backup current code** (just in case)
2. **Delete files** listed above
3. **Fix imports** in remaining files
4. **Simplify types** in types.ts
5. **Update server** initialization
6. **Test** that server still runs
7. **Start building** new tools