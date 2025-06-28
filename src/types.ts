export type AgentRole = 'pm' | 'engineer' | 'security' | 'architect';

export type SpecialistRole = Exclude<AgentRole, 'pm'>;

export interface AgentSession {
  role: AgentRole;
  currentSessionId: string;
  sessionHistory: string[];
  messageCount: number;
  createdAt: Date;
  lastActive: Date;
}

export interface DebateContext {
  topic: string;
  requirement: string;
  participants: AgentRole[];
  rounds: DebateRound[];
  status: 'active' | 'consensus' | 'escalated' | 'resolved';
  decisions: Decision[];
}

export interface DebateRound {
  round: number;
  responses: Map<AgentRole, string>;
  timestamp: Date;
}

export interface Decision {
  type: 'architecture' | 'implementation' | 'security' | 'task';
  description: string;
  rationale: string;
  proposedBy: AgentRole;
  supportedBy: AgentRole[];
  timestamp: Date;
}

export interface TaskModification {
  type: 'ADD' | 'DELETE' | 'MODIFY' | 'BLOCK' | 'SPLIT' | 'MERGE';
  taskId?: string;
  reason: string;
  details?: any;
  proposedBy: AgentRole;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  blockedBy?: string;
  assignee?: AgentRole;
  createdBy: AgentRole;
  modificationHistory: TaskModification[];
}

export interface PMDecision {
  needsSpecialists: boolean;
  requiredSpecialists: SpecialistRole[];
  debateTopic?: string;
  taskModifications: TaskModification[];
  userResponse?: string;
}

export interface SquabbleAction {
  type: 'init' | 'continue' | 'status' | 'approve' | 'intervene';
  message?: string;
  context?: any;
}