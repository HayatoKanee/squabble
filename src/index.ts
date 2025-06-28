import { FastMCP } from 'fastmcp';
import { registerAllTools } from './tools/index.js';
import { WorkspaceManager } from './workspace/manager.js';
import { SessionManager } from './agents/session-manager.js';
import { TaskManager } from './tasks/task-manager.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

export class SquabbleMCPServer {
  private server: FastMCP;
  private workspaceManager: WorkspaceManager;
  private sessionManager: SessionManager;
  private taskManager: TaskManager;

  constructor() {
    this.server = new FastMCP({
      name: 'Squabble MCP Server',
      version: packageJson.version
    });

    // Initialize managers
    this.workspaceManager = new WorkspaceManager();
    this.sessionManager = new SessionManager();
    this.taskManager = new TaskManager(this.workspaceManager);

    // Register all tools
    registerAllTools(
      this.server,
      this.workspaceManager,
      this.sessionManager,
      this.taskManager
    );
  }

  async start() {
    // Start the MCP server
    // Note: Workspace is NOT automatically initialized - use init_workspace tool
    await this.server.start({
      transportType: 'stdio'
    });

    console.error('Squabble MCP Server started successfully');
    console.error('Available tools for PM:');
    console.error('- init_workspace: Initialize Squabble workspace and settings');
    console.error('- spawn_agent: Spawn specialist agents (engineer, security, architect)');
    console.error('- send_to_agent: Communicate with spawned agents');
    console.error('- update_tasks: Manage project task list');
    console.error('- save_decision: Document architectural decisions');
    console.error('- get_agent_status: Check status of all agents');
    console.error('- debate_status: Get project debate status');
  }
}