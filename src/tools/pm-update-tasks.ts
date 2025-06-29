import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';
import { ModeManager } from '../modes/mode-manager.js';

const taskModificationSchema = z.object({
  type: z.enum(['ADD', 'DELETE', 'MODIFY', 'BLOCK', 'SPLIT', 'MERGE']),
  taskId: z.string().optional(),
  reason: z.string(),
  details: z.any()
});

const pmUpdateTasksSchema = z.object({
  modifications: z.array(taskModificationSchema)
});

export function registerPMUpdateTasks(
  server: FastMCP,
  taskManager: TaskManager,
  modeManager: ModeManager
) {
  server.addTool({
    name: 'pm_update_tasks',
    description: 'PM ONLY: Update the project task list with modifications (add, delete, modify, block, split, merge)',
    parameters: pmUpdateTasksSchema,
    execute: async (args) => {
      const { modifications } = args;

      try {
        // Check permissions
        if (!modeManager.hasPermission('pm_update_tasks')) {
          return `Error: ${modeManager.getPermissionError('pm_update_tasks')}`;
        }
        
        // Apply all modifications with timestamps
        await taskManager.applyModifications(
          modifications.map(mod => ({
            ...mod,
            timestamp: new Date()
          }))
        );

        // Get updated task list
        const tasks = await taskManager.getTasks();
        const stats = {
          total: tasks.length,
          pending: tasks.filter(t => t.status === 'pending').length,
          inProgress: tasks.filter(t => t.status === 'in-progress').length,
          review: tasks.filter(t => t.status === 'review').length,
          done: tasks.filter(t => t.status === 'done').length
        };

        const nextTasks = await taskManager.getNextTasks(3);
        return `Updated ${modifications.length} tasks. Stats: ${stats.pending} pending, ${stats.inProgress} in progress, ${stats.review} in review, ${stats.done} done. Next tasks: ${nextTasks.map(t => t.title).join(', ')}`;
      } catch (error) {
        console.error('Failed to update tasks:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to update tasks'}`;
      }
    }
  });
}