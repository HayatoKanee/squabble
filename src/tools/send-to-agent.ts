import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { SessionManager } from '../agents/session-manager.js';

const sendToAgentSchema = z.object({
  role: z.enum(['engineer', 'security', 'architect']),
  message: z.string().describe('Message to send to the specialist agent')
});

export function registerSendToAgent(
  server: FastMCP,
  sessionManager: SessionManager
) {
  server.addTool({
    name: 'send_to_agent',
    description: 'Send a message to an existing specialist agent and get their response',
    parameters: sendToAgentSchema,
    execute: async (args) => {
      const { role, message } = args;

      try {
        // Check if agent exists
        const agent = await sessionManager.getAgent(role);
        if (!agent) {
          return `Error: ${role} agent not found. Use spawn_agent first.`;
        }

        // Send message and get response
        const response = await sessionManager.sendToAgent(role, message);

        return response;
      } catch (error) {
        console.error(`Failed to send message to ${role}:`, error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`;
      }
    }
  });
}