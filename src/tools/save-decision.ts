import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { WorkspaceManager } from '../workspace/manager.js';

const saveDecisionSchema = z.object({
  type: z.enum(['architecture', 'implementation', 'security', 'task']),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.object({
    option: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string())
  })).optional(),
  supportedBy: z.array(z.enum(['pm', 'engineer', 'security', 'architect']))
});

export function registerSaveDecision(
  server: FastMCP,
  workspaceManager: WorkspaceManager
) {
  server.addTool({
    name: 'save_decision',
    description: 'Save an architectural decision record (ADR) for important project decisions',
    parameters: saveDecisionSchema,
    execute: async (args) => {
      try {
        const decision = {
          ...args,
          proposedBy: 'pm' as const,
          timestamp: new Date()
        };

        await workspaceManager.saveDecision(decision);

        return `Decision saved: ${args.title} (${args.type})`;
      } catch (error) {
        console.error('Failed to save decision:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to save decision'}`;
      }
    }
  });
}