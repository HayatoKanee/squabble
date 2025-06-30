import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { PMSessionManager } from '../pm/session-manager.js';
import { FileEventBroker } from '../streaming/file-event-broker.js';
import { TemplateService } from '../templates/template-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

const submitForReviewSchema = z.object({
  taskId: z.string().describe('ID of the task to submit for review'),
  summary: z.string().describe('Summary of what you implemented'),
  filesChanged: z.array(z.string()).describe('List of files modified'),
  testsAdded: z.boolean().describe('Whether tests were added/updated'),
  includeGitDiff: z.boolean().optional().default(true).describe('Include git diff in review'),
  questions: z.array(z.string()).optional().describe('Specific questions for PM'),
  concerns: z.array(z.string()).optional().describe('Any concerns or known issues'),
  useTemplate: z.boolean().optional().default(false).describe('Use implementation report template for structured submission')
});

/**
 * Tool for submitting work to PM for review
 * This is a BLOCKING operation - waits for PM response before continuing
 */
export function registerSubmitForReview(
  server: FastMCP,
  taskManager: TaskManager,
  workspaceManager: WorkspaceManager,
  pmSessionManager: PMSessionManager
) {
  const eventBroker = FileEventBroker.getInstance(workspaceManager);
  
  server.addTool({
    name: 'submit_for_review',
    description: 'Submit completed work to PM for review. BLOCKING: Waits for PM response. ⚠️ BLOCKING: Execution STOPS until PM responds. PM will perform DEEP code review. PM may request @User input if clarification needed.',
    parameters: submitForReviewSchema,
    execute: async (args) => {
      const { taskId, summary, filesChanged, includeGitDiff, questions, useTemplate } = args;
      
      try {
        workspaceManager.checkInitialized();
        
        // Create template service after workspace is initialized
        const templateService = new TemplateService(workspaceManager.getWorkspaceRoot());
        
        // Get task details
        const tasks = await taskManager.getTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
          return `Error: Task ${taskId} not found`;
        }
        
        if (task.status !== 'in-progress') {
          const tip = task.status === 'pending' ? 'Use claim_task first' : 'Task may already be reviewed';
          return `Error: Task is not in progress (current status: ${task.status}). ${tip}`;
        }
        
        // Get git diff if requested
        let gitDiff = '';
        if (includeGitDiff && filesChanged.length > 0) {
          try {
            const { stdout } = await execa('git', ['diff', 'HEAD', '--', ...filesChanged]);
            gitDiff = stdout;
            
            // Also get staged changes
            const { stdout: stagedDiff } = await execa('git', ['diff', '--cached', '--', ...filesChanged]);
            if (stagedDiff) {
              gitDiff += '\n\n--- STAGED CHANGES ---\n' + stagedDiff;
            }
          } catch (error) {
            console.warn('Failed to get git diff:', error);
            gitDiff = 'Unable to retrieve git diff';
          }
        }
        
        // Note: We no longer save review request separately - everything goes in review.log
        
        // Update task status to review
        await taskManager.applyModifications([{
          type: 'MODIFY',
          taskId,
          reason: 'Submitted for PM review',
          details: {
            status: 'review',
            submittedAt: new Date().toISOString()
          },
          timestamp: new Date()
        }]);
        
        // Build PM review prompt
        const reviewPrompt = buildReviewPrompt(task, args, gitDiff, templateService);
        
        // Get current PM session
        const currentSession = await pmSessionManager.getCurrentSession();
        
        // Start streaming PM session (BLOCKING)
        console.error('[Squabble] Submitting to PM for review... This may take a moment.');
        const sessionId = await eventBroker.startPMSession(
          reviewPrompt,
          PMSessionManager.createPMSystemPromptWithCustom(workspaceManager.getWorkspaceRoot()),
          currentSession?.currentSessionId,
          {
            engineerId: 'current-engineer',
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
        
        // Wait for the response to complete (no timeout)
        pmResponse = await responsePromise;
        
        // We have the sessionId for the review log
        
        // Save simple review log
        const reviewDir = path.join(
          workspaceManager.getWorkspaceRoot(),
          'workspace',
          'reviews',
          taskId
        );
        await fs.ensureDir(reviewDir);
        
        const reviewLogPath = path.join(reviewDir, 'review.log');
        const reviewLogContent = [
          '='.repeat(80),
          `Task Review: ${taskId} - ${task.title}`,
          `Reviewed: ${new Date().toISOString()}`,
          `Session ID: ${sessionId}`,
          '='.repeat(80),
          '',
          pmResponse,
          '',
          '='.repeat(80)
        ].join('\n');
        
        await fs.writeFile(reviewLogPath, reviewLogContent, 'utf-8');
        
        // Parse PM response to determine approval
        const pmDecision = parsePMResponse(pmResponse);
        
        // Update task status based on PM decision
        if (pmDecision.approved) {
          await taskManager.applyModifications([{
            type: 'MODIFY',
            taskId,
            reason: 'PM approved implementation',
            details: {
              status: 'done',
              completedAt: new Date().toISOString()
            },
            timestamp: new Date()
          }]);
          
          // Apply any task modifications suggested by PM
          if (pmDecision.taskModifications && pmDecision.taskModifications.length > 0) {
            await taskManager.applyModifications(pmDecision.taskModifications);
          }
          
          let result = 'Task approved by PM!\n\n';
          result += `PM Feedback: ${pmDecision.summary}\n\n`;
          result += 'Next Step: Use get_next_task to find your next task';
          if (pmDecision.taskModifications && pmDecision.taskModifications.length > 0) {
            result += `\n\nNote: ${pmDecision.taskModifications.length} new task(s) added based on PM feedback`;
          }
          result += `\n\nDetailed review saved in: .squabble/workspace/reviews/${taskId}/review.log`;
          return result;
        } else {
          // Return to in-progress for fixes
          await taskManager.applyModifications([{
            type: 'MODIFY',
            taskId,
            reason: 'PM requested changes',
            details: {
              status: 'in-progress',
              reviewedAt: new Date().toISOString()
            },
            timestamp: new Date()
          }]);
          
          let result = 'PM requested changes\n\n';
          result += `PM Feedback: ${pmDecision.summary}\n\n`;
          if (pmDecision.requiredChanges && pmDecision.requiredChanges.length > 0) {
            result += 'Required Changes:\n';
            result += pmDecision.requiredChanges.map((c: string) => `- ${c}`).join('\n');
            result += '\n\n';
          }
          result += 'Next Step: Address the feedback and resubmit for review\n';
          result += 'Tip: Consider using consult_pm if you need clarification on the feedback\n';
          result += `\nDetailed review saved in: .squabble/workspace/reviews/${taskId}/review.log`;
          return result;
        }
      } catch (error) {
        // Ensure task returns to in-progress on error
        try {
          await taskManager.applyModifications([{
            type: 'MODIFY',
            taskId,
            reason: 'Review failed with error',
            details: {
              status: 'in-progress'
            },
            timestamp: new Date()
          }]);
        } catch (e) {
          console.error('Failed to reset task status:', e);
        }
        
        console.error('Failed to submit for review:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to submit for review'}`;
      }
    }
  });
}

// Helper functions
function buildReviewPrompt(task: any, args: any, gitDiff: string, templateService: TemplateService): string {
    // If template is requested, use it
    if (args.useTemplate) {
      const template = templateService.getTemplate('implementation-report');
      const filledTemplate = templateService.fillTemplate(template, {
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        summary: args.summary,
        filesChanged: args.filesChanged,
        testsAdded: args.testsAdded,
        concerns: args.concerns || [],
        questions: args.questions || []
      });
      
      // Prepend the filled template and append git diff and review instructions
      const parts = [filledTemplate];
      
      if (gitDiff) {
        parts.push(`\n## Code Changes\n\`\`\`diff\n${gitDiff}\n\`\`\``);
      }
      
      parts.push(`\nPlease provide:
1. Whether the implementation is approved or needs changes
2. Specific feedback on the code quality and completeness
3. If changes are needed, list them clearly
4. Any suggestions for improvement
5. Whether any new tasks should be added based on this implementation`);
      
      return parts.join('\n\n');
    }
    
    // Otherwise use the original format
    const parts = [`Please review the implementation for task: "${task.title}"`];
    
    if (task.description) {
      parts.push(`Task Description: ${task.description}`);
    }
    
    parts.push(`\nEngineer's Summary:\n${args.summary}`);
    
    parts.push(`\nFiles Changed:\n${args.filesChanged.map((f: string) => `- ${f}`).join('\n')}`);
    
    parts.push(`\nTests Added: ${args.testsAdded ? 'Yes' : 'No'}`);
    
    if (args.concerns && args.concerns.length > 0) {
      parts.push(`\nEngineer's Concerns:\n${args.concerns.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}`);
    }
    
    if (args.questions && args.questions.length > 0) {
      parts.push(`\nQuestions for Review:\n${args.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`);
    }
    
    if (gitDiff) {
      parts.push(`\nCode Changes:\n\`\`\`diff\n${gitDiff}\n\`\`\``);
    }
    
    parts.push(`\nPlease provide:
1. Whether the implementation is approved or needs changes
2. Specific feedback on the code quality and completeness
3. If changes are needed, list them clearly
4. Any suggestions for improvement
5. Whether any new tasks should be added based on this implementation`);
    
    return parts.join('\n\n');
}

function parsePMResponse(response: string): any {
    const pmDecision = {
      approved: false,
      summary: '',
      requiredChanges: [] as string[],
      taskModifications: [] as any[]
    };
    
    // Look for approval indicators
    const approvalPatterns = [
      /approved/i,
      /looks good/i,
      /lgtm/i,
      /ready to merge/i,
      /no changes needed/i
    ];
    
    const rejectionPatterns = [
      /needs? changes?/i,
      /not approved/i,
      /requires? modification/i,
      /must fix/i,
      /please update/i
    ];
    
    const hasApprovalIndicator = approvalPatterns.some(pattern => pattern.test(response));
    const hasRejectionIndicator = rejectionPatterns.some(pattern => pattern.test(response));
    
    pmDecision.approved = hasApprovalIndicator && !hasRejectionIndicator;
    
    // Extract required changes (look for numbered lists or bullet points)
    const changePatterns = [
      /(?:^|\n)\s*[-*•]\s*(.+)/gm,
      /(?:^|\n)\s*\d+\.\s*(.+)/gm
    ];
    
    for (const pattern of changePatterns) {
      const matches = response.matchAll(pattern);
      for (const match of matches) {
        const change = match[1].trim();
        if (change && !pmDecision.requiredChanges.includes(change)) {
          pmDecision.requiredChanges.push(change);
        }
      }
    }
    
    // Extract task modifications (simplified - in production this would be more sophisticated)
    const taskModPattern = /(?:add|create|implement|should have)\s+(?:a\s+)?(?:new\s+)?task\s+(?:for|to)\s+(.+)/gi;
    const taskMatches = response.matchAll(taskModPattern);
    for (const match of taskMatches) {
      pmDecision.taskModifications.push({
        type: 'ADD',
        reason: 'PM suggested during review',
        details: {
          title: match[1].trim(),
          priority: 'medium'
        },
        timestamp: new Date()
      });
    }
    
    // Use first paragraph as summary if no specific summary found
    pmDecision.summary = response.split('\n\n')[0].trim();
    
    return pmDecision;
}