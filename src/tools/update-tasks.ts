import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';

const taskModificationSchema = z.object({
  type: z.enum(['ADD', 'DELETE', 'MODIFY', 'BLOCK', 'SPLIT', 'MERGE']),
  taskId: z.string().optional(),
  reason: z.string(),
  details: z.any()
});

const updateTasksSchema = z.object({
  modifications: z.array(taskModificationSchema)
});

export function registerUpdateTasks(
  server: FastMCP,
  taskManager: TaskManager
) {
  server.addTool({
    name: 'update_tasks',
    description: 'Update the project task list with modifications (add, delete, modify, block, split, merge)',
    parameters: updateTasksSchema,
    execute: async (args) => {
      const { modifications } = args;

      try {
        // Apply all modifications
        await taskManager.applyModifications(
          modifications.map(mod => ({
            ...mod,
            proposedBy: 'pm' // PM is always the one using this tool
          }))
        );

        // Get updated task list
        const tasks = await taskManager.getTasks();
        const stats = {
          total: tasks.length,
          pending: tasks.filter(t => t.status === 'pending').length,
          inProgress: tasks.filter(t => t.status === 'in_progress').length,
          blocked: tasks.filter(t => t.status === 'blocked').length,
          completed: tasks.filter(t => t.status === 'completed').length
        };

        const nextTasks = await taskManager.getNextTasks(3);
        return `Updated ${modifications.length} tasks. Stats: ${stats.pending} pending, ${stats.inProgress} in progress, ${stats.blocked} blocked, ${stats.completed} completed. Next tasks: ${nextTasks.map(t => t.title).join(', ')}`;
      } catch (error) {
        console.error('Failed to update tasks:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to update tasks'}`;
      }
    }
  });
}