import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { PMSessionManager } from '../pm/session-manager.js';
import { FileEventBroker } from '../streaming/file-event-broker.js';
import fs from 'fs-extra';
import path from 'path';

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
  const eventBroker = FileEventBroker.getInstance(workspaceManager);
  
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
        
        // Check if task requires a plan
        if (task.requiresPlan) {
          // Check for implementation plan file
          const planPath = path.join(
            workspaceManager.getWorkspaceRoot(), 
            'workspace', 
            'plans', 
            taskId,
            'implementation-plan.md'
          );
          
          const planExists = await fs.pathExists(planPath);
          
          if (!planExists) {
            return `Error: Task requires an implementation plan.\n\n` +
              `Please create your plan at:\n${planPath}\n\n` +
              `Plan should include:\n` +
              `- Approach and algorithm choices\n` +
              `- Technology/library decisions\n` +
              `- Risks and mitigation strategies\n` +
              `- Alternative approaches considered\n\n` +
              `Once you've created the plan, run claim_task again to submit it for PM review.`;
          }
          
          // Plan exists - check if already approved
          const approvalPath = path.join(
            workspaceManager.getWorkspaceRoot(),
            'workspace',
            'plans',
            taskId,
            'approval.json'
          );
          
          const approvalExists = await fs.pathExists(approvalPath);
          
          if (!approvalExists) {
            // Plan exists but not reviewed - submit to PM
            const planContent = await fs.readFile(planPath, 'utf-8');
            
            // Consult PM for plan review
            const pmPrompt = `Engineer ${process.env.USER || 'unknown'} is trying to claim task ${taskId}: "${task.title}"\n\n` +
              `They have submitted an implementation plan for review.\n\n` +
              `Plan location: ${planPath}\n\n` +
              `=== IMPLEMENTATION PLAN ===\n${planContent}\n=== END PLAN ===\n\n` +
              `Please review this plan and either:\n` +
              `1. APPROVE - if the approach is sound\n` +
              `2. REQUEST CHANGES - if modifications are needed\n\n` +
              `Consider: technical approach, risk assessment, completeness, and alignment with project goals.`;
            
            const pmSessionManager = new PMSessionManager(workspaceManager);
            const currentSession = await pmSessionManager.getCurrentSession();
            
            console.error('[Squabble] Submitting plan to PM for review...');
            
            // Start streaming PM session
            const sessionId = await eventBroker.startPMSession(
              pmPrompt,
              PMSessionManager.createPMSystemPrompt(),
              currentSession?.currentSessionId,
              {
                engineerId: process.env.USER || 'unknown',
                taskId: taskId
              }
            );
            
            // Collect PM response from streaming session
            let pmResponse = '';
            const responsePromise = new Promise<string>((resolve) => {
              const messageHandler = (event: any) => {
                if (event.sessionId === sessionId) {
                  if (event.type === 'pm_message' && event.message) {
                    pmResponse += event.message;
                  } else if (event.type === 'session_end') {
                    eventBroker.off('pm-event', messageHandler);
                    resolve(pmResponse);
                  }
                }
              };
              eventBroker.on('pm-event', messageHandler);
            });
            
            // Wait for the response to complete with timeout
            const timeoutPromise = new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error('PM response timeout')), 120000) // 2 minute timeout
            );
            
            try {
              pmResponse = await Promise.race([responsePromise, timeoutPromise]);
            } catch (error) {
              if (error instanceof Error && error.message === 'PM response timeout') {
                pmResponse = 'PM response timed out. The streaming session may still be running. Check the PM activity log for details.';
                console.error('[Squabble] PM plan review timed out');
              } else {
                throw error;
              }
            }
            
            // Parse PM response
            const approved = pmResponse.toLowerCase().includes('approve') && 
                           !pmResponse.toLowerCase().includes('not approve') &&
                           !pmResponse.toLowerCase().includes('request changes');
            
            if (approved) {
              // Save approval
              await fs.writeJson(approvalPath, {
                approved: true,
                reviewedAt: new Date(),
                reviewedBy: 'PM',
                sessionId,
                feedback: pmResponse
              }, { spaces: 2 });
              
              // Continue with claiming the task
              // Fall through to normal claim process
            } else {
              // Plan needs revision
              const reviewPath = path.join(
                workspaceManager.getWorkspaceRoot(),
                'workspace',
                'plans',
                taskId,
                `review-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
              );
              
              await fs.writeFile(reviewPath, `# Plan Review Feedback\n\nTask: ${task.title}\nReviewed: ${new Date().toISOString()}\n\n## PM Feedback\n\n${pmResponse}`, 'utf-8');
              
              return `Plan review: Changes requested by PM\n\n` +
                `PM Feedback has been saved to:\n${reviewPath}\n\n` +
                `Please update your implementation plan based on the feedback and try claiming again.\n\n` +
                `Tip: Use consult_pm if you need clarification on the feedback.`;
            }
          }
          // If we get here, plan is approved - continue with normal claim
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
        result += `\n📋 Next Steps:\n`;
        result += `1. Use consult_pm to discuss your implementation approach\n`;
        result += `2. Ask the PM about any unclear requirements or edge cases\n`;
        result += `3. Implement the solution\n`;
        result += `4. Use submit_for_review when complete\n`;
        result += `\n💡 Tip: The PM is your partner - consult early and often for better outcomes!`;
        
        if (otherInProgress.length > 0) {
          result += `\n\n⚠️ Warning: ${otherInProgress.length} other task(s) also in progress. Consider focusing on one task at a time.`;
        }
        
        return result;
      } catch (error) {
        console.error('Failed to claim task:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to claim task'}`;
      }
    }
  });
}