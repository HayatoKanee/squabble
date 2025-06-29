import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';
import { WorkspaceManager } from '../workspace/manager.js';

const claimTaskSchema = z.object({
  taskId: z.string().describe('ID of the task to claim'),
  notes: z.string().optional().describe('Optional notes about your implementation plan')
});

/**
 * Tool for claiming a task (marking it as in-progress)
 * Simple status update to track what engineer is working on
 */
export function registerClaimTask(
  server: FastMCP,
  taskManager: TaskManager,
  workspaceManager: WorkspaceManager
) {
  server.addTool({
    name: 'claim_task',
    description: 'Claim a task by marking it as in-progress',
    parameters: claimTaskSchema,
    execute: async (args) => {
      const { taskId, notes } = args;
      
      try {
        const tasks = await taskManager.getTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
          return `Error: Task ${taskId} not found. Use get_next_task to find available tasks.`;
        }
        
        // Validate task can be claimed
        if (task.status !== 'pending') {
          const tip = task.status === 'in-progress' 
            ? 'Task is already being worked on'
            : task.status === 'review'
            ? 'Task is awaiting PM review'
            : 'Task is already completed';
          return `Error: Task is already ${task.status}. ${tip}`;
        }
        
        // Check dependencies
        const unmetDependencies = task.dependencies.filter(depId => {
          const depTask = tasks.find(t => t.id === depId);
          return depTask && depTask.status !== 'done';
        });
        
        if (unmetDependencies.length > 0) {
          const depDetails = unmetDependencies.map(depId => {
            const depTask = tasks.find(t => t.id === depId);
            return depTask ? `${depTask.title} (${depTask.status})` : depId;
          });
          
          return `Error: Task has unmet dependencies:\n${depDetails.map(d => `- ${d}`).join('\n')}\n\nTip: Complete dependency tasks first or consult PM about changing dependencies`;
        }
        
        // Update task status
        await taskManager.applyModifications([{
          type: 'MODIFY',
          taskId: task.id,
          reason: notes || 'Engineer claimed task',
          details: {
            status: 'in-progress',
            claimedAt: new Date().toISOString()
          },
          timestamp: new Date()
        }]);
        
        // Save context for later reference
        await workspaceManager.saveContext('current-task', {
          taskId: task.id,
          title: task.title,
          claimedAt: new Date(),
          notes
        });
        
        // Check if any other tasks are in progress
        const otherInProgress = tasks.filter(t => 
          t.id !== taskId && t.status === 'in-progress'
        );
        
        let result = `Successfully claimed task: "${task.title}"\n`;
        result += `Task ID: ${task.id}\n`;
        result += `Priority: ${task.priority}\n`;
        if (task.description) {
          result += `Description: ${task.description}\n`;
        }
        result += `\nTip: Remember to submit_for_review when implementation is complete`;
        
        if (otherInProgress.length > 0) {
          result += `\n\nWarning: ${otherInProgress.length} other task(s) also in progress. Consider focusing on one task at a time.`;
        }
        
        return result;
      } catch (error) {
        console.error('Failed to claim task:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to claim task'}`;
      }
    }
  });
}