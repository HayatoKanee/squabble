// Simplified types for sequential engineer-PM workflow

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  blockedBy?: string;
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

// New types for sequential workflow
export interface ReviewRequest {
  taskId: string;
  summary: string;
  filesChanged: string[];
  gitDiff?: string;
  questions?: string[];
  timestamp: Date;
  pmSessionId: string;  // Track which PM session handled this
}

export interface PMFeedback {
  approved: boolean;
  feedback: string;
  requiredChanges?: string[];
  taskModifications?: TaskModification[];
  sessionId: string;  // Which PM session gave this feedback
}

export interface WorkflowContext {
  currentTaskId?: string;
  pmSession?: PMSession;
  lastReview?: ReviewRequest;
  pmFeedback?: PMFeedback;
  userClarifications?: string[];
}