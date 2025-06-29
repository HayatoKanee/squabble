import { FastMCP } from 'fastmcp';
import { registerAllTools } from './tools/index.js';
import { WorkspaceManager } from './workspace/manager.js';
import { TaskManager } from './tasks/task-manager.js';
import { ModeManager } from './modes/mode-manager.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

export class SquabbleMCPServer {
  private server: FastMCP;
  private workspaceManager: WorkspaceManager;
  private taskManager: TaskManager;
  private modeManager: ModeManager;

  constructor() {
    this.server = new FastMCP({
      name: 'Squabble MCP Server',
      version: packageJson.version
    });

    // Initialize managers
    this.modeManager = new ModeManager();
    this.workspaceManager = new WorkspaceManager();
    this.taskManager = new TaskManager(this.workspaceManager);

    // Register all tools
    registerAllTools(
      this.server,
      this.workspaceManager,
      this.taskManager,
      this.modeManager
    );
  }

  async start() {
    // Start the MCP server
    // Note: Workspace is NOT automatically initialized - use init_workspace tool
    await this.server.start({
      transportType: 'stdio'
    });

    console.error('Squabble MCP Server started successfully');
    console.error('Available tools for sequential workflow:');
    console.error('- init_workspace: Initialize Squabble workspace');
    console.error('- apply_modifications: Apply approved task list modifications');
    console.error('- save_decision: Document architectural decisions');
    console.error('');
    console.error('Coming soon:');
    console.error('- consult_pm: Initial PM consultation on requirements');
    console.error('- get_next_task: Get next task to work on');
    console.error('- claim_task: Mark task as in-progress');
    console.error('- submit_for_review: Submit work for PM review (blocking)');
    console.error('- propose_modification: Suggest task list changes');
  }
}