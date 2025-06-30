// Simplified types for sequential engineer-PM workflow

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  blockedBy?: string;
  requiresPlan: boolean;  // If true, engineer must submit implementation plan before claiming
  modificationHistory: TaskModification[];
}

export interface TaskModification {
  type: 'ADD' | 'DELETE' | 'MODIFY' | 'BLOCK' | 'SPLIT' | 'MERGE';
  taskId?: string;
  reason: string;
  details?: any;
  timestamp: Date;
}

export interface Decision {
  type: 'architecture' | 'implementation' | 'security' | 'task';
  description: string;
  rationale: string;
  timestamp: Date;
}

// PM session management for --resume functionality
export interface PMSession {
  currentSessionId: string;  // Latest session UUID
  sessionHistory: string[];  // Keep last 3 session UUIDs max
  createdAt: Date;
  lastActive: Date;
}

export interface WorkflowContext {
  currentTaskId?: string;
  pmSession?: PMSession;
  userClarifications?: string[];
}