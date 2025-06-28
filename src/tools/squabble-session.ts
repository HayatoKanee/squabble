import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { PMOrchestrator } from '../pm/orchestrator.js';

const squabbleSessionSchema = z.object({
  action: z.enum(['init', 'continue', 'status', 'approve', 'intervene']),
  message: z.string().optional(),
  context: z.any().optional()
});

export function registerSquabbleSession(server: FastMCP, pmOrchestrator: PMOrchestrator) {
  server.addTool({
    name: 'squabble_session',
    description: 'Interact with Squabble PM to manage development with debate-driven approach',
    parameters: squabbleSessionSchema,
    execute: async (args) => {
      try {
        const { action, message } = args;

        switch (action) {
          case 'init':
            if (!message) {
              return {
                success: false,
                error: 'Initial requirement message is required'
              };
            }
            return await pmOrchestrator.initialize(message);

          case 'continue':
            if (!message) {
              return {
                success: false,
                error: 'Message is required to continue conversation'
              };
            }
            return await pmOrchestrator.continueConversation(message);

          case 'status':
            return await pmOrchestrator.getStatus();

          case 'approve':
            return await pmOrchestrator.approveCurrentProposal();

          case 'intervene':
            if (!message) {
              return {
                success: false,
                error: 'Intervention message is required'
              };
            }
            return await pmOrchestrator.handleIntervention(message);

          default:
            return {
              success: false,
              error: `Unknown action: ${action}`
            };
        }
      } catch (error) {
        console.error('Error in squabble_session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
      }
    }
  });
}