import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import path from 'path';
import { WorkspaceManager } from '../workspace/manager.js';
import { PMSessionManager } from '../pm/session-manager.js';
import { FileEventBroker } from '../streaming/file-event-broker.js';

const consultPMSchema = z.object({
  message: z.string().describe('Your message or question for the PM'),
  context: z.object({
    currentTask: z.string().optional().describe('Current task you are working on'),
    codeSnippet: z.string().optional().describe('Relevant code to discuss'),
    specificQuestions: z.array(z.string()).optional().describe('Specific questions for PM')
  }).optional(),
  continueSession: z.boolean().optional().default(true).describe('Continue existing PM session if available')
});

/**
 * Tool for consulting with the PM on requirements, approach, or any questions
 * This maintains a continuous dialogue with the PM using --resume functionality
 */
export function registerConsultPM(
  server: FastMCP,
  workspaceManager: WorkspaceManager,
  pmSessionManager: PMSessionManager
) {
  const eventBroker = FileEventBroker.getInstance(workspaceManager);
  
  server.addTool({
    name: 'consult_pm',
    description: 'Consult with the PM about requirements, approach, or any questions. Maintains conversation context. MANDATORY first step. Research deeply with WebSearch BEFORE consulting. Use @User to escalate questions to human.',
    parameters: consultPMSchema,
    execute: async (args) => {
      const { message, context, continueSession } = args;
      
      try {
        // Check if workspace is initialized
        workspaceManager.checkInitialized();
        
        // Build the full prompt with context
        let fullPrompt = message;
        
        if (context) {
          const contextParts: string[] = [];
          
          if (context.currentTask) {
            contextParts.push(`Current Task: ${context.currentTask}`);
          }
          
          if (context.codeSnippet) {
            contextParts.push(`Code Context:\n\`\`\`\n${context.codeSnippet}\n\`\`\``);
          }
          
          if (context.specificQuestions && context.specificQuestions.length > 0) {
            contextParts.push(`Specific Questions:\n${context.specificQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
          }
          
          if (contextParts.length > 0) {
            fullPrompt = `${contextParts.join('\n\n')}\n\n${message}`;
          }
        }
        
        // Get current session if we should continue
        let resumeSessionId: string | undefined;
        if (continueSession) {
          const currentSession = await pmSessionManager.getCurrentSession();
          resumeSessionId = currentSession?.currentSessionId;
        }
        
        // Start streaming PM session
        const sessionId = await eventBroker.startPMSession(
          fullPrompt,
          PMSessionManager.createPMSystemPromptWithCustom(workspaceManager.getWorkspaceRoot()),
          resumeSessionId,
          {
            engineerId: 'current-engineer', // TODO: Get actual engineer ID
            taskId: context?.currentTask
          }
        );
        
        // Collect PM response from streaming session
        let response = '';
        const responsePromise = new Promise<string>((resolve) => {
          const messageHandler = (event: any) => {
            if (event.sessionId === sessionId) {
              if (event.type === 'pm_message' && event.message) {
                response += event.message;
              } else if (event.type === 'session_end') {
                eventBroker.off('pm-event', messageHandler);
                resolve(response);
              }
            }
          };
          eventBroker.on('pm-event', messageHandler);
        });
        
        // Wait for the response to complete (no timeout)
        response = await responsePromise;
        
        // Save conversation context
        await workspaceManager.saveContext('last-pm-consultation', {
          timestamp: new Date(),
          message,
          context,
          response,
          sessionId
        });
        
        const sessionInfo = resumeSessionId 
          ? 'Continuing previous PM session. Context maintained.'
          : 'Started new PM session. Use continueSession=true to maintain context.';
        
        const activityLogPath = path.join(workspaceManager.getWorkspaceRoot(), 'pm-activity.log');
        
        return `PM Response:\n\n${response}\n\n---\nSession ID: ${sessionId}\n${sessionInfo}\n\n📝 PM activity log: ${activityLogPath}`;
      } catch (error) {
        console.error('Failed to consult PM:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to consult PM'}. Ensure Claude CLI is installed and workspace is initialized.`;
      }
    }
  });
}