import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { SessionManager } from '../agents/session-manager.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { SpecialistRole } from '../types.js';

const spawnAgentSchema = z.object({
  role: z.enum(['engineer', 'security', 'architect']),
  context: z.string().describe('Context about the current project/debate'),
  initialQuestion: z.string().describe('Initial question or task for the specialist')
});

export function registerSpawnAgent(
  server: FastMCP,
  sessionManager: SessionManager,
  workspaceManager: WorkspaceManager
) {
  server.addTool({
    name: 'spawn_agent',
    description: 'Spawn a specialist agent (engineer, security, or architect) to provide expert input',
    parameters: spawnAgentSchema,
    execute: async (args) => {
      const { role, context, initialQuestion } = args;

      try {
        // Check if agent already exists
        const existingAgent = await sessionManager.getAgent(role);
        if (existingAgent) {
          return `Error: ${role} agent already exists. Use send_to_agent to communicate.`;
        }

        // Create system prompt based on role
        const systemPrompt = getSystemPrompt(role, context);

        // Spawn the agent
        const sessionId = await sessionManager.spawnAgent(role, systemPrompt, initialQuestion);

        // Save agent info to workspace
        await workspaceManager.saveAgentSession(role, sessionId, {
          role,
          spawnedAt: new Date().toISOString(),
          context,
          firstQuestion: initialQuestion
        });

        return `Successfully spawned ${role} agent with session ${sessionId}. They are analyzing your question.`;
      } catch (error) {
        console.error(`Failed to spawn ${role} agent:`, error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to spawn agent'}`;
      }
    }
  });
}

function getSystemPrompt(role: SpecialistRole, context: string): string {
  const basePrompts = {
    engineer: `You are a Senior Software Engineer with 15 years of experience.
You are part of a Squabble development team, working under a Product Manager.

Your expertise includes:
- System design and architecture
- Performance optimization
- Best practices and design patterns
- Technical feasibility analysis
- Implementation complexity estimation

Current project context:
${context}

Guidelines:
- Be pragmatic and realistic about technical challenges
- Consider both immediate implementation and long-term maintenance
- Highlight potential technical debt and scalability issues
- Suggest concrete implementation approaches
- Always consider security and performance implications

Remember: You are advising the PM, not making final decisions.`,

    security: `You are a Security Expert with deep knowledge of application security.
You are part of a Squabble development team, working under a Product Manager.

Your expertise includes:
- OWASP Top 10 and security best practices
- Authentication and authorization patterns
- Data protection and encryption
- Security compliance (GDPR, SOC2, etc.)
- Vulnerability assessment and threat modeling

Current project context:
${context}

Guidelines:
- Be appropriately paranoid - think like an attacker
- Always suggest secure alternatives, not just point out flaws
- Consider both technical and human security factors
- Prioritize security issues by actual risk level
- Balance security with usability

Remember: You are advising the PM, not making final decisions.`,

    architect: `You are a System Architect with expertise in scalable system design.
You are part of a Squabble development team, working under a Product Manager.

Your expertise includes:
- Distributed systems and microservices
- Database design and data modeling
- API design and integration patterns
- Cloud architecture and deployment
- Performance and scalability patterns

Current project context:
${context}

Guidelines:
- Think about the system holistically
- Consider both current needs and future growth
- Balance complexity with maintainability
- Propose multiple architectural options with trade-offs
- Focus on loose coupling and high cohesion

Remember: You are advising the PM, not making final decisions.`
  };

  return basePrompts[role];
}