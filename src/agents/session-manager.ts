import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { AgentSession, SpecialistRole } from '../types.js';

export class SessionManager {
  private agents: Map<SpecialistRole, AgentSession> = new Map();
  private claudeProjectPath: string;

  constructor() {
    // Construct the Claude project path
    const projectName = process.cwd().replace(/\//g, '-');
    this.claudeProjectPath = path.join(
      os.homedir(),
      '.claude',
      'projects',
      projectName
    );
  }

  async spawnAgent(
    role: SpecialistRole,
    systemPrompt: string,
    initialMessage: string
  ): Promise<string> {
    // Execute claude with specialist system prompt using stdin
    const { stdout } = await execa('claude', [
      '-p',
      '--system-prompt',
      systemPrompt,
      '--dangerously-skip-permissions'
    ], {
      input: initialMessage
      // No timeout - let agents work as long as needed
    });

    // Get the session ID from the latest session file
    const sessionId = await this.findLatestSession();
    
    // Create agent session
    const agentSession: AgentSession = {
      role,
      currentSessionId: sessionId,
      sessionHistory: [sessionId],
      messageCount: 1,
      createdAt: new Date(),
      lastActive: new Date()
    };

    this.agents.set(role, agentSession);
    
    return sessionId;
  }

  async sendToAgent(role: SpecialistRole, message: string): Promise<string> {
    const agent = this.agents.get(role);
    if (!agent) {
      throw new Error(`Agent ${role} not found`);
    }

    // Resume the session with the new message using stdin
    const { stdout } = await execa('claude', [
      '-p',
      '--resume',
      agent.currentSessionId,
      '--dangerously-skip-permissions'
    ], {
      input: message
      // No timeout - let agents work as long as needed
    });

    // Update session (--resume creates new session file)
    const newSessionId = await this.findLatestSession();
    agent.currentSessionId = newSessionId;
    agent.sessionHistory.push(newSessionId);
    agent.messageCount++;
    agent.lastActive = new Date();

    return stdout;
  }

  async getAgent(role: SpecialistRole): Promise<AgentSession | null> {
    return this.agents.get(role) || null;
  }

  async getAllAgents(): Promise<AgentSession[]> {
    return Array.from(this.agents.values());
  }

  private async findLatestSession(): Promise<string> {
    try {
      // Wait a moment for file to be written
      await new Promise(resolve => setTimeout(resolve, 100));

      // List all .jsonl files in the Claude project directory
      const files = await fs.readdir(this.claudeProjectPath);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

      if (sessionFiles.length === 0) {
        throw new Error('No session files found');
      }

      // Get file stats to find the most recent
      const fileStats = await Promise.all(
        sessionFiles.map(async (file) => {
          const filePath = path.join(this.claudeProjectPath, file);
          const stats = await fs.stat(filePath);
          return {
            file: file.replace('.jsonl', ''),
            mtime: stats.mtime.getTime()
          };
        })
      );

      // Sort by modification time (most recent first)
      fileStats.sort((a, b) => b.mtime - a.mtime);

      return fileStats[0].file;
    } catch (error) {
      console.error('Error finding latest session:', error);
      throw new Error('Failed to find latest session');
    }
  }

  // Cleanup old sessions to prevent clutter
  async cleanupOldSessions(keepLast: number = 5): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.sessionHistory.length > keepLast) {
        const toDelete = agent.sessionHistory.slice(0, -keepLast);
        for (const sessionId of toDelete) {
          try {
            await fs.unlink(path.join(this.claudeProjectPath, `${sessionId}.jsonl`));
          } catch (error) {
            // Session might already be deleted
          }
        }
        agent.sessionHistory = agent.sessionHistory.slice(-keepLast);
      }
    }
  }
}