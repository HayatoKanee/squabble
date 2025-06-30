import fs from 'fs-extra';
import path from 'path';
import { Task, Decision, PMSession } from '../types.js';

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
      'workspace/reviews',  // For review requests/responses
      'workspace/context',
      'workspace/plans',    // For implementation plans
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
    this.checkInitialized();
    return this.workspaceRoot;
  }

  private getTasksPath(): string {
    return path.join(this.workspaceRoot, 'workspace/tasks/tasks.json');
  }

  private getDecisionsPath(): string {
    return path.join(this.workspaceRoot, 'workspace/decisions');
  }

  private getReviewsPath(): string {
    return path.join(this.workspaceRoot, 'workspace/reviews');
  }

  private getContextPath(): string {
    return path.join(this.workspaceRoot, 'workspace/context');
  }

  // Task Management
  async getTasks(): Promise<Task[]> {
    try {
      const data = await fs.readFile(this.getTasksPath(), 'utf-8');
      return JSON.parse(data) || [];
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

  // PM Session Management (for --resume functionality)
  async savePMSession(session: PMSession): Promise<void> {
    const sessionPath = path.join(this.getContextPath(), 'pm-session.json');
    
    // Ensure we only keep last 3 sessions
    if (session.sessionHistory.length > 3) {
      session.sessionHistory = session.sessionHistory.slice(-3);
    }
    
    await fs.writeFile(
      sessionPath,
      JSON.stringify(session, null, 2),
      'utf-8'
    );
  }

  async getPMSession(): Promise<PMSession | null> {
    try {
      const sessionPath = path.join(this.getContextPath(), 'pm-session.json');
      const data = await fs.readFile(sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // Review directory path for new review.log files
  // Keeping the getReviewsPath for directory structure

  // Context Management
  async saveContext(key: string, data: any): Promise<void> {
    const contextPath = path.join(this.getContextPath(), `${key}.json`);
    await fs.writeFile(
      contextPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  async getContext(key: string): Promise<any> {
    try {
      const contextPath = path.join(this.getContextPath(), `${key}.json`);
      const data = await fs.readFile(contextPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}