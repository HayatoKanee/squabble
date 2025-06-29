import { FastMCP } from 'fastmcp';
import { registerInitWorkspace } from './init-workspace.js';
import { registerPMUpdateTasks } from './pm-update-tasks.js';
import { registerSaveDecision } from './save-decision.js';
import { registerConsultPM } from './consult-pm.js';
import { registerGetNextTask } from './get-next-task.js';
import { registerClaimTask } from './claim-task.js';
import { registerSubmitForReview } from './submit-for-review.js';
import { registerProposeModification } from './propose-modification.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { TaskManager } from '../tasks/task-manager.js';
import { ModeManager } from '../modes/mode-manager.js';

export function registerAllTools(
  server: FastMCP,
  workspaceManager: WorkspaceManager,
  taskManager: TaskManager,
  modeManager: ModeManager
) {
  // Register core tools for sequential workflow
  registerInitWorkspace(server, workspaceManager);
  registerPMUpdateTasks(server, taskManager, modeManager);  // PM-only task management
  registerSaveDecision(server, workspaceManager);
  
  // Register engineer-PM workflow tools
  registerConsultPM(server, workspaceManager);
  registerGetNextTask(server, taskManager);
  registerClaimTask(server, taskManager, workspaceManager);
  registerSubmitForReview(server, taskManager, workspaceManager);
  registerProposeModification(server, taskManager, workspaceManager);
}