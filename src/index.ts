import { FastMCP } from 'fastmcp';
import { WorkspaceManager } from './workspace/manager.js';
import { TaskManager } from './tasks/task-manager.js';
import { PMSessionManager } from './pm/session-manager.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import individual tool registrations
import { registerInitWorkspace } from './tools/init-workspace.js';
import { registerSaveDecision } from './tools/save-decision.js';
import { registerConsultPM } from './tools/consult-pm.js';
import { registerGetNextTask } from './tools/get-next-task.js';
import { registerClaimTask } from './tools/claim-task.js';
import { registerSubmitForReview } from './tools/submit-for-review.js';
import { registerProposeModification } from './tools/propose-modification.js';
import { registerPMUpdateTasks } from './tools/pm-update-tasks-clean.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

export class SquabbleMCPServer {
  private server: FastMCP;
  private workspaceManager: WorkspaceManager;
  private taskManager: TaskManager;
  private pmSessionManager: PMSessionManager;
  private role: 'engineer' | 'pm';

  constructor(role: 'engineer' | 'pm' = 'engineer') {
    this.role = role;
    this.server = new FastMCP({
      name: `Squabble MCP Server (${role})`,
      version: packageJson.version
    });

    // Initialize managers
    this.workspaceManager = new WorkspaceManager();
    this.taskManager = new TaskManager(this.workspaceManager);
    this.pmSessionManager = new PMSessionManager(this.workspaceManager);

    // Register tools based on role
    if (role === 'pm') {
      // PM only gets pm_update_tasks
      registerPMUpdateTasks(this.server, this.taskManager);
    } else {
      // Engineer gets all tools except pm_update_tasks
      registerInitWorkspace(this.server, this.workspaceManager);
      registerSaveDecision(this.server, this.workspaceManager);
      registerConsultPM(this.server, this.workspaceManager, this.pmSessionManager);
      registerGetNextTask(this.server, this.taskManager);
      registerClaimTask(this.server, this.taskManager, this.workspaceManager, this.pmSessionManager);
      registerSubmitForReview(this.server, this.taskManager, this.workspaceManager, this.pmSessionManager);
      registerProposeModification(this.server, this.taskManager, this.workspaceManager, this.pmSessionManager);
    }
  }


  async start() {
    // Start the MCP server
    // Note: Workspace is NOT automatically initialized - use init_workspace tool
    await this.server.start({
      transportType: 'stdio'
    });

    console.error(`Squabble MCP Server (${this.role}) started successfully`);
    console.error('');
    console.error('Available tools:');
    
    if (this.role === 'pm') {
      console.error('- pm_update_tasks: Manage project task list');
      console.error('');
      console.error('PM mode: Only task management tools available');
    } else {
      console.error('- init_workspace: Initialize Squabble workspace');
      console.error('- save_decision: Document architectural decisions');
      console.error('- consult_pm: Discuss requirements with PM');
      console.error('- get_next_task: Get next priority task');
      console.error('- claim_task: Mark task as in-progress');
      console.error('- submit_for_review: Submit work for PM review');
      console.error('- propose_modification: Suggest task list changes');
      console.error('');
      console.error('Engineer mode: Task management restricted to PM role');
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.error('\nShutting down Squabble MCP Server...');
      process.exit(0);
    });
  }
}