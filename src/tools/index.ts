import { FastMCP } from 'fastmcp';
import { registerInitWorkspace } from './init-workspace.js';
import { registerSpawnAgent } from './spawn-agent.js';
import { registerSendToAgent } from './send-to-agent.js';
import { registerUpdateTasks } from './update-tasks.js';
import { registerSaveDecision } from './save-decision.js';
import { registerGetAgentStatus } from './get-agent-status.js';
import { registerDebateStatus } from './debate-status.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { SessionManager } from '../agents/session-manager.js';
import { TaskManager } from '../tasks/task-manager.js';

export function registerAllTools(
  server: FastMCP,
  workspaceManager: WorkspaceManager,
  sessionManager: SessionManager,
  taskManager: TaskManager
) {
  // Register initialization tool first
  registerInitWorkspace(server, workspaceManager);
  
  // Register all other tools that the PM can use
  registerSpawnAgent(server, sessionManager, workspaceManager);
  registerSendToAgent(server, sessionManager);
  registerUpdateTasks(server, taskManager);
  registerSaveDecision(server, workspaceManager);
  registerGetAgentStatus(server, sessionManager);
  registerDebateStatus(server, workspaceManager);
}