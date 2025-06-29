import { execa } from 'execa';
import { v4 as uuid } from 'uuid';
import { PMSession } from '../types.js';
import { WorkspaceManager } from '../workspace/manager.js';
import path from 'path';
import fs from 'fs-extra';

/**
 * Manages PM sessions for the --resume functionality
 * Handles spawning PM with claude CLI and tracking session UUIDs
 */
export class PMSessionManager {
  constructor(private workspaceManager: WorkspaceManager) {}

  /**
   * Spawns a new PM session or resumes an existing one
   * @param prompt The initial prompt or continued conversation
   * @param systemPrompt The PM's system prompt
   * @param resumeSessionId Optional session ID to resume from
   * @returns The PM's response and session information
   */
  async consultPM(
    prompt: string,
    systemPrompt: string,
    resumeSessionId?: string
  ): Promise<{ response: string; sessionId: string }> {
    const args = [
      '-p',
      '--system-prompt',
      systemPrompt
    ];
    
    // Add resume flag if continuing a session
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }
    
    try {
      // Execute claude CLI with prompt via stdin
      const { stdout, stderr } = await execa('claude', args, {
        input: prompt
      });
      
      if (stderr) {
        console.error('Claude CLI stderr:', stderr);
      }
      
      if (!stdout || stdout.trim() === '') {
        throw new Error('No response from PM - claude CLI returned empty output');
      }
      
      // Get the new session ID from the latest session file
      const sessionId = await this.findLatestSessionId();
      
      // Update PM session tracking
      await this.updatePMSession(sessionId, resumeSessionId);
      
      return {
        response: stdout,
        sessionId
      };
    } catch (error) {
      console.error('PM consultation error:', error);
      if (error instanceof Error && 'stderr' in error) {
        console.error('stderr:', (error as any).stderr);
      }
      throw new Error(`Failed to consult PM: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the Claude project sessions directory for the current project
   */
  private getProjectSessionsDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error('Cannot determine home directory');
    }
    
    // Get current project path and convert to Claude project directory format
    const projectPath = process.cwd();
    const projectDirName = projectPath.replace(/\//g, '-');
    
    return path.join(homeDir, '.claude', 'projects', projectDirName);
  }

  /**
   * Finds the most recent Claude session ID from the project directory
   * Also cleans up old PM sessions to keep only the latest
   */
  private async findLatestSessionId(): Promise<string> {
    const sessionsDir = this.getProjectSessionsDir();
    
    try {
      // Ensure sessions directory exists
      if (!await fs.pathExists(sessionsDir)) {
        throw new Error(`Claude project directory not found: ${sessionsDir}`);
      }
      
      const files = await fs.readdir(sessionsDir);
      const sessionFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(sessionsDir, f),
          time: fs.statSync(path.join(sessionsDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
      
      if (sessionFiles.length === 0) {
        throw new Error('No Claude sessions found in project directory');
      }
      
      // Get the latest session ID
      const latestFile = sessionFiles[0].name;
      const latestSessionId = latestFile.replace('.jsonl', '');
      
      // Clean up old PM sessions if we have a stored session
      const pmSession = await this.workspaceManager.getPMSession();
      if (pmSession && pmSession.sessionHistory.length > 0) {
        // Keep only the latest PM session file, delete others
        for (const sessionFile of sessionFiles) {
          const sessionId = sessionFile.name.replace('.jsonl', '');
          if (sessionId !== latestSessionId && pmSession.sessionHistory.includes(sessionId)) {
            try {
              await fs.remove(sessionFile.path);
              console.log(`Cleaned up old PM session: ${sessionId}`);
            } catch (err) {
              console.error(`Failed to clean up session ${sessionId}:`, err);
            }
          }
        }
      }
      
      return latestSessionId;
    } catch (error) {
      throw new Error(`Failed to find Claude session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates the PM session tracking with new session information
   * Maintains only the last 3 sessions for space efficiency
   */
  private async updatePMSession(newSessionId: string, previousSessionId?: string): Promise<void> {
    let session = await this.workspaceManager.getPMSession();
    
    if (!session) {
      // Create new session
      session = {
        currentSessionId: newSessionId,
        sessionHistory: [newSessionId],
        createdAt: new Date(),
        lastActive: new Date()
      };
    } else {
      // Update existing session
      session.currentSessionId = newSessionId;
      session.lastActive = new Date();
      
      // Add to history if not already present
      if (!session.sessionHistory.includes(newSessionId)) {
        session.sessionHistory.push(newSessionId);
        
        // Keep only last 3 sessions
        if (session.sessionHistory.length > 3) {
          session.sessionHistory = session.sessionHistory.slice(-3);
        }
      }
    }
    
    await this.workspaceManager.savePMSession(session);
  }

  /**
   * Gets the current PM session information
   */
  async getCurrentSession(): Promise<PMSession | null> {
    return await this.workspaceManager.getPMSession();
  }

  /**
   * Creates the PM system prompt with proper context and instructions
   */
  static createPMSystemPrompt(): string {
    return `You are the Product Manager (PM) for Squabble, working in partnership with a Lead Engineer.

Your responsibilities:
1. Refine and clarify requirements through dialogue
2. Own and maintain the project task list
3. Review code and provide quality feedback
4. Make task prioritization decisions
5. Validate work before it goes to users

Key behaviors:
- Ask clarifying questions for vague requirements
- Break down work into clear, implementable tasks
- Consider security, scalability, and maintainability
- Provide specific, actionable feedback on code
- Be constructive but thorough in reviews

When reviewing code:
- Check for completeness against requirements
- Verify error handling and edge cases
- Ensure code follows best practices
- Consider performance implications
- Validate test coverage

Task management:
- Tasks should be specific and measurable
- Set clear dependencies between tasks
- Prioritize based on user value and technical dependencies
- Update task status based on engineer progress

Remember: You're a partner, not a gatekeeper. Help the engineer succeed while maintaining quality.`;
  }
}