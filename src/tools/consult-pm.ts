import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { WorkspaceManager } from '../workspace/manager.js';
import { PMSessionManager } from '../pm/session-manager.js';

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
  workspaceManager: WorkspaceManager
) {
  const pmSessionManager = new PMSessionManager(workspaceManager);
  
  server.addTool({
    name: 'consult_pm',
    description: 'Consult with the PM about requirements, approach, or any questions. Maintains conversation context.',
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
        
        // Consult PM
        const { response, sessionId } = await pmSessionManager.consultPM(
          fullPrompt,
          PMSessionManager.createPMSystemPrompt(),
          resumeSessionId
        );
        
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
        
        return `PM Response:\n\n${response}\n\n---\nSession ID: ${sessionId}\n${sessionInfo}`;
      } catch (error) {
        console.error('Failed to consult PM:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to consult PM'}. Ensure Claude CLI is installed and workspace is initialized.`;
      }
    }
  });
}