import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';
import { Task } from '../types.js';

const getNextTaskSchema = z.object({
  considerPriority: z.boolean().optional().default(true).describe('Consider task priority when selecting'),
  includeBlocked: z.boolean().optional().default(false).describe('Include tasks that are blocked by others')
});

/**
 * Tool for getting the next task to work on
 * Considers dependencies, priority, and current status
 */
export function registerGetNextTask(
  server: FastMCP,
  taskManager: TaskManager
) {
  server.addTool({
    name: 'get_next_task',
    description: 'Get the next task to work on based on dependencies and priority',
    parameters: getNextTaskSchema,
    execute: async (args) => {
      const { considerPriority, includeBlocked } = args;
      
      try {
        const tasks = await taskManager.getTasks();
        
        if (tasks.length === 0) {
          return 'No tasks found. Use update_tasks to add tasks or consult PM to create initial task list.';
        }
        
        // Filter for eligible tasks
        let eligibleTasks = tasks.filter(task => {
          // Only pending tasks
          if (task.status !== 'pending') return false;
          
          // Skip blocked tasks unless requested
          if (!includeBlocked && task.blockedBy) return false;
          
          // Check if all dependencies are completed
          const dependenciesMet = task.dependencies.every(depId => {
            const depTask = tasks.find(t => t.id === depId);
            return !depTask || depTask.status === 'done';
          });
          
          return dependenciesMet;
        });
        
        if (eligibleTasks.length === 0) {
          // Provide helpful information about why no tasks are available
          const inProgress = tasks.filter(t => t.status === 'in-progress');
          const inReview = tasks.filter(t => t.status === 'review');
          const blocked = tasks.filter(t => t.blockedBy);
          const withUnmetDeps = tasks.filter(t => 
            t.status === 'pending' && 
            t.dependencies.some(depId => {
              const depTask = tasks.find(dt => dt.id === depId);
              return depTask && depTask.status !== 'done';
            })
          );
          
          const reasons: string[] = [];
          if (inProgress.length > 0) {
            reasons.push(`${inProgress.length} task(s) in progress`);
          }
          if (inReview.length > 0) {
            reasons.push(`${inReview.length} task(s) awaiting review`);
          }
          if (blocked.length > 0) {
            reasons.push(`${blocked.length} task(s) blocked`);
          }
          if (withUnmetDeps.length > 0) {
            reasons.push(`${withUnmetDeps.length} task(s) have unmet dependencies`);
          }
          
          const suggestion = inReview.length > 0 
            ? 'Complete reviews before starting new tasks.'
            : 'Check task dependencies or consult PM for guidance.';
            
          return `No eligible tasks available. ${reasons.join(', ')}.\n\nSuggestion: ${suggestion}`;
        }
        
        // Sort by priority if requested
        if (considerPriority) {
          const priorityOrder: Record<string, number> = {
            'critical': 0,
            'high': 1,
            'medium': 2,
            'low': 3
          };
          
          eligibleTasks.sort((a, b) => {
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            
            // Secondary sort by number of dependencies (prefer tasks that unblock others)
            const aDependents = tasks.filter(t => t.dependencies.includes(a.id)).length;
            const bDependents = tasks.filter(t => t.dependencies.includes(b.id)).length;
            return bDependents - aDependents;
          });
        }
        
        const nextTask = eligibleTasks[0];
        const dependentTasks = tasks.filter(t => t.dependencies.includes(nextTask.id));
        
        const dependencies = nextTask.dependencies.map(depId => {
          const depTask = tasks.find(t => t.id === depId);
          return depTask ? `${depTask.title} (${depTask.status})` : depId;
        });
        
        let result = `Found next task: "${nextTask.title}" (${nextTask.priority} priority)\n`;
        result += `Task ID: ${nextTask.id}\n`;
        if (nextTask.description) {
          result += `Description: ${nextTask.description}\n`;
        }
        if (dependencies.length > 0) {
          result += `Dependencies: ${dependencies.join(', ')}\n`;
        }
        result += `\nTip: Use claim_task to mark this task as in-progress`;
        
        if (dependentTasks.length > 0) {
          result += `\nImpact: Completing this will unblock ${dependentTasks.length} other task(s)`;
        }
        
        return result;
      } catch (error) {
        console.error('Failed to get next task:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to get next task'}`;
      }
    }
  });
}