import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { WorkspaceManager } from '../workspace/manager.js';
import { TaskManager } from '../tasks/task-manager.js';

const debateStatusSchema = z.object({});

export function registerDebateStatus(
  server: FastMCP,
  workspaceManager: WorkspaceManager
) {
  server.addTool({
    name: 'debate_status',
    description: 'Get a comprehensive status of the current project debate and decisions',
    parameters: debateStatusSchema,
    execute: async () => {
      try {
        // Get workspace root to confirm initialization
        const workspaceRoot = workspaceManager.getWorkspaceRoot();
        
        // Get recent decisions
        const decisionsPath = workspaceManager.getDecisionsPath();
        
        // For now, return basic status
        // In production, this would aggregate debate history
        const status = {
          workspaceInitialized: true,
          workspacePath: workspaceRoot,
          recentDecisions: [], // TODO: Implement decision fetching
          activeDebates: []    // TODO: Implement debate tracking
        };

        return `Debate Status:\nWorkspace: ${status.workspacePath}\nRecent decisions: ${status.recentDecisions.length}\nActive debates: ${status.activeDebates.length}`;
      } catch (error) {
        console.error('Failed to get debate status:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to get debate status'}`;
      }
    }
  });
}