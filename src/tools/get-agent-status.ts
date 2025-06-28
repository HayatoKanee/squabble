import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { SessionManager } from '../agents/session-manager.js';

const getAgentStatusSchema = z.object({});

export function registerGetAgentStatus(
  server: FastMCP,
  sessionManager: SessionManager
) {
  server.addTool({
    name: 'get_agent_status',
    description: 'Get the status of all spawned specialist agents',
    parameters: getAgentStatusSchema,
    execute: async () => {
      try {
        const agents = await sessionManager.getAllAgents();
        
        const status = {
          activeAgents: agents.map(agent => ({
            role: agent.role,
            sessionId: agent.currentSessionId,
            messageCount: agent.messageCount,
            lastActive: agent.lastActive,
            sessionHistory: agent.sessionHistory.length
          })),
          totalAgents: agents.length
        };

        return `Active agents: ${status.totalAgents}\n${status.activeAgents.map(a => `- ${a.role}: ${a.messageCount} messages, last active ${a.lastActive}`).join('\n')}`;
      } catch (error) {
        console.error('Failed to get agent status:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to get agent status'}`;
      }
    }
  });
}