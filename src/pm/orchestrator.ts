import { execa } from 'execa';
import { v4 as uuid } from 'uuid';
import { WorkspaceManager } from '../workspace/manager.js';
import { SessionManager } from './session-manager.js';
import { DecisionParser } from './decision-parser.js';
import { TaskManager } from './task-manager.js';
import { 
  AgentSession, 
  DebateContext, 
  PMDecision, 
  SpecialistRole,
  Task
} from '../types.js';

export class PMOrchestrator {
  private sessionManager: SessionManager;
  private decisionParser: DecisionParser;
  private taskManager: TaskManager;
  private pmSession: AgentSession | null = null;
  private specialists: Map<SpecialistRole, AgentSession> = new Map();
  private currentDebate: DebateContext | null = null;
  private isInitialized = false;

  constructor(private workspaceManager: WorkspaceManager) {
    this.sessionManager = new SessionManager();
    this.decisionParser = new DecisionParser();
    this.taskManager = new TaskManager(workspaceManager);
  }

  async initialize(requirement: string): Promise<any> {
    if (this.isInitialized) {
      return {
        success: false,
        error: 'PM is already initialized. Use continue action instead.'
      };
    }

    try {
      // Spawn PM agent
      const pmSystemPrompt = this.getPMSystemPrompt();
      const initialMessage = `New project requirement: ${requirement}

Please analyze this requirement and:
1. Identify any clarifications needed
2. Determine if specialist consultation is required
3. Create initial task breakdown if possible

Remember: You are the only agent who can interact with users and spawn specialists.`;

      const response = await this.spawnPM(pmSystemPrompt, initialMessage);
      
      this.isInitialized = true;

      // Parse PM's decision
      const decision = this.decisionParser.parsePMResponse(response);
      
      // Handle any task modifications
      if (decision.taskModifications.length > 0) {
        await this.taskManager.applyModifications(decision.taskModifications);
      }

      return {
        success: true,
        response: decision.userResponse || response,
        needsClarification: decision.needsSpecialists === false && !decision.userResponse,
        tasks: await this.taskManager.getTasks()
      };
    } catch (error) {
      console.error('Failed to initialize PM:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize PM'
      };
    }
  }

  async continueConversation(message: string): Promise<any> {
    if (!this.isInitialized || !this.pmSession) {
      return {
        success: false,
        error: 'PM not initialized. Use init action first.'
      };
    }

    try {
      // Send message to PM
      const response = await this.sessionManager.sendToAgent(
        this.pmSession.currentSessionId,
        message
      );

      // Update PM session
      this.pmSession = await this.sessionManager.updateSession(this.pmSession);

      // Parse PM's decision
      const decision = this.decisionParser.parsePMResponse(response);

      // If PM needs specialists, orchestrate debate
      if (decision.needsSpecialists) {
        const debateResult = await this.orchestrateDebate(decision);
        return {
          success: true,
          response: debateResult.synthesis,
          debateId: debateResult.debateId,
          tasks: await this.taskManager.getTasks()
        };
      }

      // Handle task modifications
      if (decision.taskModifications.length > 0) {
        await this.taskManager.applyModifications(decision.taskModifications);
      }

      return {
        success: true,
        response: decision.userResponse || response,
        tasks: await this.taskManager.getTasks()
      };
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to continue conversation'
      };
    }
  }

  async getStatus(): Promise<any> {
    const tasks = await this.taskManager.getTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const blockedTasks = tasks.filter(t => t.status === 'blocked');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    let debateStatus = null;
    if (this.currentDebate) {
      debateStatus = {
        topic: this.currentDebate.topic,
        status: this.currentDebate.status,
        participants: this.currentDebate.participants,
        rounds: this.currentDebate.rounds.length
      };
    }

    return {
      success: true,
      initialized: this.isInitialized,
      pmActive: this.pmSession !== null,
      specialists: Array.from(this.specialists.keys()),
      debate: debateStatus,
      tasks: {
        total: tasks.length,
        pending: pendingTasks.length,
        inProgress: inProgressTasks.length,
        blocked: blockedTasks.length,
        completed: completedTasks.length,
        nextTasks: pendingTasks.slice(0, 3).map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority
        }))
      }
    };
  }

  async approveCurrentProposal(): Promise<any> {
    // TODO: Implement approval logic
    return {
      success: true,
      message: 'Approval recorded'
    };
  }

  async handleIntervention(message: string): Promise<any> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'PM not initialized'
      };
    }

    // Forward intervention to PM with context
    const interventionMessage = `[USER INTERVENTION]: ${message}

Please acknowledge this input and adjust your approach accordingly.`;

    return await this.continueConversation(interventionMessage);
  }

  private async spawnPM(systemPrompt: string, initialMessage: string): Promise<string> {
    // Execute claude with PM system prompt
    const { stdout } = await execa('claude', [
      '-p',
      '--system-prompt',
      systemPrompt,
      initialMessage
    ]);

    // Get the session ID from the latest session file
    const sessionId = await this.sessionManager.findLatestSession();
    
    // Create PM session
    this.pmSession = {
      role: 'pm',
      currentSessionId: sessionId,
      sessionHistory: [sessionId],
      messageCount: 1,
      createdAt: new Date(),
      lastActive: new Date()
    };

    // Save session info
    await this.workspaceManager.saveAgentSession('pm', sessionId, this.pmSession);

    return stdout;
  }

  private async orchestrateDebate(decision: PMDecision): Promise<any> {
    const debateId = uuid();
    
    // Initialize debate context
    this.currentDebate = {
      topic: decision.debateTopic || 'Technical approach discussion',
      requirement: '',
      participants: ['pm', ...decision.requiredSpecialists],
      rounds: [],
      status: 'active',
      decisions: []
    };

    // Spawn required specialists
    for (const role of decision.requiredSpecialists) {
      if (!this.specialists.has(role)) {
        await this.spawnSpecialist(role);
      }
    }

    // Run debate rounds (simplified for now)
    const synthesis = await this.runDebateRound();

    // Save debate record
    await this.workspaceManager.saveDebate(debateId, this.currentDebate);

    return {
      debateId,
      synthesis
    };
  }

  private async spawnSpecialist(role: SpecialistRole): Promise<void> {
    const systemPrompt = this.getSpecialistSystemPrompt(role);
    const initialMessage = `You are joining a Squabble debate as ${role}. 
Wait for the PM to provide context and questions.
Remember: You can only respond to the PM, not directly to users.`;

    const { stdout } = await execa('claude', [
      '-p',
      '--system-prompt',
      systemPrompt,
      initialMessage
    ]);

    const sessionId = await this.sessionManager.findLatestSession();
    
    const session: AgentSession = {
      role,
      currentSessionId: sessionId,
      sessionHistory: [sessionId],
      messageCount: 1,
      createdAt: new Date(),
      lastActive: new Date()
    };

    this.specialists.set(role, session);
    await this.workspaceManager.saveAgentSession(role, sessionId, session);
  }

  private async runDebateRound(): Promise<string> {
    // Simplified debate implementation
    // In production, this would involve multiple rounds of specialist consultation
    return `Based on initial analysis, the team recommends proceeding with a phased approach.
Further details will be provided after specialist consultation.`;
  }

  private getPMSystemPrompt(): string {
    return `You are the Product Manager for Squabble, an AI development system that debates before coding.

Your unique responsibilities:
1. You are the ONLY agent who interacts with users
2. You are the ONLY agent who can spawn other specialists (engineer, security, architect)
3. You own and maintain the dynamic task list
4. You synthesize all specialist feedback for users
5. You make final decisions on technical approach

When analyzing requirements:
- Ask clarifying questions for vague requirements
- Identify when specialist input is needed
- Break down work into clear tasks
- Consider security, scalability, and maintainability

Format your responses with clear sections:
- Analysis: Your understanding of the requirement
- Questions: Any clarifications needed
- Next Steps: What you plan to do

When you need specialist input, indicate this with:
[DECISION]
needsSpecialists: true
specialists: engineer, security
topic: "Specific technical question"
[/DECISION]

For task modifications, use:
[TASK_MODIFY]
ADD "Task title" PRIORITY high
DELETE task-id "Reason"
MODIFY task-id "New description"
[/TASK_MODIFY]

Remember: Be skeptical, ask hard questions, and ensure we build the RIGHT thing.`;
  }

  private getSpecialistSystemPrompt(role: SpecialistRole): string {
    const prompts = {
      engineer: `You are a Senior Engineer specialist in Squabble.
Focus on technical feasibility, implementation complexity, and best practices.
You can ONLY respond to the PM's questions, not directly to users.
Be pragmatic and highlight potential technical challenges.`,

      security: `You are a Security Expert specialist in Squabble.
Focus on identifying vulnerabilities, compliance requirements, and security best practices.
You can ONLY respond to the PM's questions, not directly to users.
Be paranoid but constructive - always suggest secure alternatives.`,

      architect: `You are a System Architect specialist in Squabble.
Focus on scalable design, system integration, and long-term maintainability.
You can ONLY respond to the PM's questions, not directly to users.
Consider both immediate needs and future growth.`
    };

    return prompts[role];
  }
}