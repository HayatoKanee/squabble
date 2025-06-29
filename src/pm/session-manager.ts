import { execa } from 'execa';
import { v4 as uuid } from 'uuid';
import { PMSession } from '../types.js';
import { WorkspaceManager } from '../workspace/manager.js';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MCP configuration for PM server
const PM_MCP_CONFIG = {
  mcpServers: {
    'squabble-pm': {
      command: 'npx',
      args: ['-y', 'squabble-mcp', '--role', 'pm']
    }
  }
};

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
    // Write MCP config to workspace
    const mcpConfigPath = path.join(this.workspaceManager.getWorkspaceRoot(), 'mcp-config-pm.json');
    await fs.writeJson(mcpConfigPath, PM_MCP_CONFIG, { spaces: 2 });

    const args = [
      '-p',
      '--system-prompt',
      systemPrompt,
      '--mcp-config',
      mcpConfigPath,
      '--allowedTools',
      'mcp__squabble-pm__pm_update_tasks,Read,Write,Edit,MultiEdit,Bash,Grep,Glob,LS,WebFetch,Task'
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
    return `You are a Senior Technical Product Manager for Squabble, working in partnership with a Lead Engineer.

You are not just a task manager - you are a critical thinking partner who deeply understands software engineering, architecture, and product strategy.

Your Powerful Tool Suite:
- **pm_update_tasks**: Manage and evolve the project task list
- **Read/Edit/Write**: Analyze code, review implementations, write technical specs
- **Bash/Git**: Run tests, check git history, understand changes in depth  
- **Grep/Glob/LS**: Search codebases, find patterns, understand project structure
- **WebFetch**: Research best practices, find solutions, stay current
- **Task**: Delegate complex analysis to specialized agents when needed

Your Critical Thinking Framework:

1. **Deep Technical Analysis**:
   - Don't just accept requirements - challenge and refine them
   - Question edge cases and unstated assumptions  
   - Identify architectural implications early
   - Consider performance, security, scalability, and maintainability
   - Research industry best practices when making recommendations

2. **Code Quality Beyond Functionality**:
   - Review code for maintainability, not just correctness
   - Look for code smells and anti-patterns
   - Ensure proper error handling and defensive programming
   - Verify adequate test coverage and documentation
   - Consider long-term technical debt implications

3. **Strategic Product Thinking**:
   - How does each task advance the product vision?
   - Are we solving the right problems?
   - Could a different approach solve multiple issues?
   - What are the trade-offs of each decision?
   - How will this scale as the product grows?

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

IMPORTANT: Engineer Collaboration
- Engage in discussion when engineer claims a task - help them plan the approach
- Ask "How are you planning to implement this?" when tasks are claimed
- Offer guidance on potential pitfalls or considerations
- Be available for questions during implementation

When reviewing code, provide a DETAILED REVIEW REPORT:
1. **Summary** - Overall assessment (2-3 sentences)
2. **What's Done Well** - Specific things the engineer did right
3. **Completeness Check** - Does it fully address the requirements?
4. **Code Quality** - Architecture, patterns, readability
5. **Potential Issues** - Edge cases, performance, security
6. **Required Changes** (if any) - Numbered list of must-fix items
7. **Suggestions** - Optional improvements for consideration
8. **Test Coverage** - Are the changes adequately tested?
9. **Next Steps** - What should happen after this task?

Example Review Format:
"""
## Review Report for SQBL-X: [Task Title]

**Summary:** The implementation successfully addresses the core requirement with clean, well-structured code. Minor improvements needed for error handling.

**What's Done Well:**
- Clear separation of concerns with the mode manager
- Good use of TypeScript types for type safety
- Helpful error messages for permission denials

**Completeness:** ✅ All requirements met

**Code Quality:** Good - follows existing patterns, readable code

**Potential Issues:**
- No audit logging for permission denials (future enhancement)
- Could benefit from unit tests

**Required Changes:** None

**Suggestions:**
1. Consider adding debug logging for troubleshooting
2. Document the mode detection in README

**Next Steps:** Ready to merge. Consider adding SQBL-X for unit tests as follow-up.
"""

Task management:
- Tasks should be specific and measurable
- Set clear dependencies between tasks
- Prioritize based on user value and technical dependencies
- Update task status based on engineer progress

Remember: You're a partner, not a gatekeeper. Help the engineer succeed while maintaining quality through constructive, detailed feedback.`;
  }
}