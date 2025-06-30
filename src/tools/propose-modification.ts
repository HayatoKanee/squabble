import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { TaskManager } from '../tasks/task-manager.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { PMSessionManager } from '../pm/session-manager.js';
import { FileEventBroker } from '../streaming/file-event-broker.js';

const taskModificationProposalSchema = z.object({
  type: z.enum(['ADD', 'DELETE', 'MODIFY', 'BLOCK', 'SPLIT', 'MERGE']),
  taskId: z.string().optional(),
  details: z.any(),
  reason: z.string()
});

const proposeModificationSchema = z.object({
  reason: z.string().describe('Overall reason for proposing these changes'),
  modifications: z.array(taskModificationProposalSchema).describe('List of proposed modifications'),
  context: z.string().optional().describe('Additional context for PM to consider')
});

/**
 * Tool for proposing changes to the task list
 * PM must approve all modifications before they are applied
 */
export function registerProposeModification(
  server: FastMCP,
  taskManager: TaskManager,
  workspaceManager: WorkspaceManager,
  pmSessionManager: PMSessionManager
) {
  const eventBroker = FileEventBroker.getInstance(workspaceManager);
  
  server.addTool({
    name: 'propose_modification',
    description: 'Propose changes to the task list. PM must approve before changes are applied. PM approval REQUIRED before changes apply. Include research to support proposal.',
    parameters: proposeModificationSchema,
    execute: async (args) => {
      const { reason, modifications, context } = args;
      
      try {
        workspaceManager.checkInitialized();
        
        // Get current tasks for context
        const currentTasks = await taskManager.getTasks();
        
        // Validate modifications
        const validationErrors: string[] = [];
        for (const mod of modifications) {
          if (['DELETE', 'MODIFY', 'BLOCK', 'SPLIT', 'MERGE'].includes(mod.type) && !mod.taskId) {
            validationErrors.push(`${mod.type} modification requires taskId`);
          }
          
          if (mod.taskId) {
            const task = currentTasks.find(t => t.id === mod.taskId);
            if (!task) {
              validationErrors.push(`Task ${mod.taskId} not found`);
            }
          }
          
          // Validate specific modification types
          if (mod.type === 'ADD' && (!mod.details?.title || !mod.details?.priority)) {
            validationErrors.push('ADD modification requires title and priority');
          }
          
          if (mod.type === 'SPLIT' && (!mod.details?.subtasks || !Array.isArray(mod.details.subtasks))) {
            validationErrors.push('SPLIT modification requires subtasks array');
          }
        }
        
        if (validationErrors.length > 0) {
          return `Error: Invalid modifications\n\nValidation Errors:\n${validationErrors.map(e => `- ${e}`).join('\n')}\n\nTip: Fix validation errors and try again`;
        }
        
        // Build proposal for PM
        const proposalPrompt = buildProposalPrompt(reason, modifications, context, currentTasks);
        
        // Get current PM session
        const currentSession = await pmSessionManager.getCurrentSession();
        
        // Start streaming PM session
        console.error('[Squabble] Proposing task modifications to PM...');
        const sessionId = await eventBroker.startPMSession(
          proposalPrompt,
          PMSessionManager.createPMSystemPromptWithCustom(workspaceManager.getWorkspaceRoot()),
          currentSession?.currentSessionId,
          {
            engineerId: 'current-engineer'
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
          } else {
            throw error;
          }
        }
        
        // Parse PM decision
        const pmDecision = parsePMDecision(pmResponse, modifications);
        
        if (pmDecision.approved) {
          // PM approved the modifications
          let result = 'PM approved your proposed modifications!\n\n';
          result += `PM Feedback: ${pmDecision.feedback}\n\n`;
          result += `Note: The PM will now apply these modifications using pm_update_tasks.\n`;
          result += `You should wait for the PM to update the task list, then use get_next_task to see the changes.`;
          
          if (pmDecision.additionalSuggestions && pmDecision.additionalSuggestions.length > 0) {
            result += '\n\nPM Additional Suggestions:\n';
            result += pmDecision.additionalSuggestions.map((s: string) => `- ${s}`).join('\n');
          }
          
          // Save the approved modifications for PM reference
          await workspaceManager.saveContext('approved-modifications', {
            timestamp: new Date(),
            modifications: pmDecision.approvedModifications,
            pmFeedback: pmDecision.feedback,
            proposedBy: 'engineer',
            reason
          });
          
          return result;
        } else {
          let result = 'PM did not approve modifications\n\n';
          result += `PM Feedback: ${pmDecision.feedback}\n\n`;
          if (pmDecision.concerns && pmDecision.concerns.length > 0) {
            result += 'PM Concerns:\n';
            result += pmDecision.concerns.map((c: string) => `- ${c}`).join('\n');
            result += '\n\n';
          }
          if (pmDecision.alternativeSuggestion) {
            result += `Alternative Suggestion: ${pmDecision.alternativeSuggestion}\n\n`;
          }
          result += 'Tip: Consider PM feedback and revise your proposal';
          return result;
        }
      } catch (error) {
        console.error('Failed to propose modification:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to propose modification'}`;
      }
    }
  });
}

// Helper functions
function buildProposalPrompt(reason: string, modifications: any[], context: string | undefined, currentTasks: any[]): string {
    const parts = ['I need to propose some changes to our task list.'];
    
    parts.push(`\nReason: ${reason}`);
    
    if (context) {
      parts.push(`\nAdditional Context: ${context}`);
    }
    
    parts.push('\nProposed Modifications:');
    
    modifications.forEach((mod, index) => {
      parts.push(`\n${index + 1}. ${mod.type} ${mod.taskId ? `(Task ${mod.taskId})` : ''}`);
      parts.push(`   Reason: ${mod.reason}`);
      
      if (mod.type === 'ADD') {
        parts.push(`   New Task: ${mod.details.title}`);
        parts.push(`   Priority: ${mod.details.priority}`);
        if (mod.details.description) {
          parts.push(`   Description: ${mod.details.description}`);
        }
        if (mod.details.dependencies) {
          parts.push(`   Dependencies: ${mod.details.dependencies.join(', ')}`);
        }
      } else if (mod.type === 'MODIFY' && mod.details) {
        if (mod.details.title) parts.push(`   New Title: ${mod.details.title}`);
        if (mod.details.description) parts.push(`   New Description: ${mod.details.description}`);
        if (mod.details.priority) parts.push(`   New Priority: ${mod.details.priority}`);
        if (mod.details.status) parts.push(`   New Status: ${mod.details.status}`);
      } else if (mod.type === 'SPLIT' && mod.details?.subtasks) {
        parts.push(`   Split into: ${mod.details.subtasks.join(', ')}`);
      } else if (mod.type === 'BLOCK' && mod.details?.blockedBy) {
        parts.push(`   Blocked by: ${mod.details.blockedBy}`);
      }
    });
    
    parts.push('\nCurrent Task Summary:');
    parts.push(`- Total: ${currentTasks.length} tasks`);
    parts.push(`- Pending: ${currentTasks.filter(t => t.status === 'pending').length}`);
    parts.push(`- In Progress: ${currentTasks.filter(t => t.status === 'in-progress').length}`);
    parts.push(`- Done: ${currentTasks.filter(t => t.status === 'done').length}`);
    
    parts.push('\nPlease review these modifications and let me know if you approve them. If not, please explain your concerns and suggest alternatives if applicable.');
    
    return parts.join('\n');
}

function parsePMDecision(response: string, proposedMods: any[]): any {
    const decision = {
      approved: false,
      feedback: response,
      approvedModifications: [] as any[],
      concerns: [] as string[],
      alternativeSuggestion: '',
      additionalSuggestions: [] as string[]
    };
    
    // Check for approval
    const approvalPatterns = [
      /approved?/i,
      /looks good/i,
      /go ahead/i,
      /makes sense/i,
      /agree with/i
    ];
    
    const rejectionPatterns = [
      /not approved?/i,
      /disagree/i,
      /don't think/i,
      /wouldn't recommend/i,
      /instead/i
    ];
    
    const hasApproval = approvalPatterns.some(p => p.test(response));
    const hasRejection = rejectionPatterns.some(p => p.test(response));
    
    decision.approved = hasApproval && !hasRejection;
    
    if (decision.approved) {
      // By default, approve all proposed modifications
      decision.approvedModifications = proposedMods;
      
      // Look for partial approvals (e.g., "approve 1 and 3 but not 2")
      const partialPattern = /approve.*?(\d+(?:\s*,?\s*(?:and\s+)?\d+)*)/i;
      const partialMatch = response.match(partialPattern);
      if (partialMatch) {
        const approvedIndices = partialMatch[1]
          .split(/[,\s]+|and/)
          .map(s => parseInt(s.trim()) - 1)
          .filter(n => !isNaN(n));
        
        decision.approvedModifications = proposedMods.filter((_, index) => 
          approvedIndices.includes(index)
        );
      }
    }
    
    // Extract concerns
    const concernPatterns = [
      /concern(?:ed)?\s*(?:is|about|that)\s*(.+?)(?:\.|$)/gi,
      /worry\s*(?:is|about|that)\s*(.+?)(?:\.|$)/gi,
      /(?:^|\n)\s*[-*]\s*(.+)/gm
    ];
    
    for (const pattern of concernPatterns) {
      const matches = response.matchAll(pattern);
      for (const match of matches) {
        const concern = match[1].trim();
        if (concern && concern.length > 10) {
          decision.concerns.push(concern);
        }
      }
    }
    
    // Look for alternative suggestions
    const altPattern = /(?:instead|alternatively|suggest|recommend)\s*(?:you\s*)?(.+?)(?:\.|$)/i;
    const altMatch = response.match(altPattern);
    if (altMatch) {
      decision.alternativeSuggestion = altMatch[1].trim();
    }
    
    return decision;
}