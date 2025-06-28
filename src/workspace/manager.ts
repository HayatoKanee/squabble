import fs from 'fs-extra';
import path from 'path';
import { Task, Decision, DebateContext } from '../types.js';

export class WorkspaceManager {
  private workspaceRoot: string;
  private projectRoot: string;
  private isInitialized: boolean = false;

  constructor() {
    // Get the current working directory (project root)
    this.projectRoot = process.cwd();
    this.workspaceRoot = path.join(this.projectRoot, '.squabble');
    // Check if already initialized
    this.isInitialized = fs.existsSync(this.workspaceRoot);
  }

  async initialize(): Promise<void> {
    // Create workspace structure
    const directories = [
      'workspace/requirements',
      'workspace/designs',
      'workspace/decisions',
      'workspace/tasks',
      'workspace/debates',
      'workspace/context',
      'sessions',
      'archive'
    ];

    for (const dir of directories) {
      await fs.ensureDir(path.join(this.workspaceRoot, dir));
    }

    // Initialize default files if they don't exist
    const tasksFile = this.getTasksPath();
    if (!await fs.pathExists(tasksFile)) {
      await this.saveTasks([]);
    }
    
    this.isInitialized = true;
  }
  
  checkInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Squabble workspace not initialized. Run init_workspace first.');
    }
  }

  // Paths
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  getSessionsPath(): string {
    return path.join(this.workspaceRoot, 'sessions');
  }

  getTasksPath(): string {
    return path.join(this.workspaceRoot, 'workspace', 'tasks', 'current.json');
  }

  getDebatesPath(): string {
    return path.join(this.workspaceRoot, 'workspace', 'debates');
  }

  getDecisionsPath(): string {
    return path.join(this.workspaceRoot, 'workspace', 'decisions');
  }

  // Task Management
  async getTasks(): Promise<Task[]> {
    try {
      const tasksData = await fs.readFile(this.getTasksPath(), 'utf-8');
      return JSON.parse(tasksData);
    } catch (error) {
      return [];
    }
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    await fs.writeFile(
      this.getTasksPath(),
      JSON.stringify(tasks, null, 2),
      'utf-8'
    );
  }

  // Debate Management
  async saveDebate(debateId: string, debate: DebateContext): Promise<void> {
    const debatePath = path.join(this.getDebatesPath(), `${debateId}.json`);
    await fs.writeFile(
      debatePath,
      JSON.stringify(debate, null, 2),
      'utf-8'
    );
  }

  async getDebate(debateId: string): Promise<DebateContext | null> {
    try {
      const debatePath = path.join(this.getDebatesPath(), `${debateId}.json`);
      const data = await fs.readFile(debatePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // Decision Management
  async saveDecision(decision: Decision): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const decisionPath = path.join(
      this.getDecisionsPath(),
      `${timestamp}-${decision.type}.json`
    );
    await fs.writeFile(
      decisionPath,
      JSON.stringify(decision, null, 2),
      'utf-8'
    );
  }

  // Session Management
  async saveAgentSession(role: string, sessionId: string, data: any): Promise<void> {
    const sessionPath = path.join(this.getSessionsPath(), `${role}-sessions.json`);
    let sessions: Record<string, any> = {};
    
    try {
      const existing = await fs.readFile(sessionPath, 'utf-8');
      sessions = JSON.parse(existing);
    } catch (error) {
      // File doesn't exist yet
    }

    sessions[sessionId] = {
      ...data,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(sessionPath, JSON.stringify(sessions, null, 2), 'utf-8');
  }

  async getLatestSession(role: string): Promise<string | null> {
    try {
      const sessionPath = path.join(this.getSessionsPath(), `${role}-sessions.json`);
      const data = await fs.readFile(sessionPath, 'utf-8');
      const sessions = JSON.parse(data);
      
      const sessionIds = Object.keys(sessions);
      if (sessionIds.length === 0) return null;
      
      // Get the most recent session
      return sessionIds.sort((a, b) => 
        sessions[b].timestamp.localeCompare(sessions[a].timestamp)
      )[0];
    } catch (error) {
      return null;
    }
  }

  // Context Management
  async saveContext(contextType: string, content: any): Promise<void> {
    const contextPath = path.join(
      this.workspaceRoot,
      'workspace',
      'context',
      `${contextType}.json`
    );
    await fs.writeFile(
      contextPath,
      JSON.stringify(content, null, 2),
      'utf-8'
    );
  }

  async getContext(contextType: string): Promise<any | null> {
    try {
      const contextPath = path.join(
        this.workspaceRoot,
        'workspace',
        'context',
        `${contextType}.json`
      );
      const data = await fs.readFile(contextPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}