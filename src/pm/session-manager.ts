import { execa } from 'execa';
import { v4 as uuid } from 'uuid';
import { PMSession } from '../types.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { createPMSystemPrompt } from './custom-prompt.js';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MCP configuration for PM server
// In development, use local path. In production (npm), use npx
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const PM_MCP_CONFIG = {
  mcpServers: {
    'squabble-pm': {
      command: isDevelopment ? 'node' : 'npx',
      args: isDevelopment 
        ? [path.join(__dirname, '../../../dist/mcp-server/server.js'), '--role', 'pm']
        : ['-y', 'squabble-mcp', '--role', 'pm']
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
   * Parses tool usage from Claude CLI stream-json output and writes to activity log
   * Also extracts session ID from system events
   */
  private async logPMActivity(output: string): Promise<{ sessionId?: string }> {
    const activityLogPath = path.join(this.workspaceManager.getWorkspaceRoot(), 'pm-activity.log');
    const structuredLogPath = path.join(this.workspaceManager.getWorkspaceRoot(), 'pm-activity.jsonl');
    const lines = output.split('\n').filter(line => line.trim());
    let sessionId: string | undefined;
    const toolUsageEvents: any[] = [];
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        
        // Handle different event types
        switch (event.type) {
          case 'system':
            // Extract session ID from system init event
            if (event.subtype === 'init' && event.session_id) {
              sessionId = event.session_id;
              await fs.appendFile(activityLogPath, `[${new Date().toISOString()}] 🚀 PM Session Started (ID: ${sessionId})\n`);
              
              // Also save structured log
              await fs.appendFile(structuredLogPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                type: 'session_start',
                sessionId,
                tools: event.tools
              }) + '\n');
            }
            break;
            
          case 'tool_use':
            const activity = this.formatToolUse(event);
            await fs.appendFile(activityLogPath, activity + '\n');
            
            // Save structured event
            const toolEvent = {
              timestamp: new Date().toISOString(),
              type: 'tool_use',
              tool: event.name,
              args: event.input,
              id: event.id
            };
            toolUsageEvents.push(toolEvent);
            await fs.appendFile(structuredLogPath, JSON.stringify(toolEvent) + '\n');
            break;
            
          case 'tool_result':
            // Log tool results for more context
            const resultSummary = this.formatToolResult(event);
            if (resultSummary) {
              await fs.appendFile(activityLogPath, resultSummary + '\n');
            }
            
            // Update structured event with result
            const matchingTool = toolUsageEvents.find(t => t.id === event.tool_use_id);
            if (matchingTool) {
              await fs.appendFile(structuredLogPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                type: 'tool_result',
                tool_use_id: event.tool_use_id,
                summary: resultSummary
              }) + '\n');
            }
            break;
            
          case 'thinking':
            // Log PM thinking process in development mode
            if (process.env.NODE_ENV === 'development') {
              await fs.appendFile(activityLogPath, `[${new Date().toISOString()}] 🤔 PM Thinking: ${event.content?.substring(0, 100)}...\n`);
            }
            break;
            
          case 'assistant':
            // Log key decisions or findings
            if (event.message?.content) {
              for (const content of event.message.content) {
                if (content.type === 'text' && content.text) {
                  // Look for key phrases that indicate important findings
                  const text = content.text;
                  if (/approved|rejected|found|issue|problem|concern|good|excellent/i.test(text)) {
                    const snippet = text.replace(/\n/g, ' ');
                    await fs.appendFile(activityLogPath, `[${new Date().toISOString()}] 💬 PM: ${snippet}\n`);
                  }
                }
              }
            }
            break;
        }
      } catch (e) {
        // Skip non-JSON lines but log parsing errors in development
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to parse JSON line:', line, e);
        }
        continue;
      }
    }
    
    return { sessionId };
  }
  
  /**
   * Formats tool usage events into human-readable activity log entries
   */
  private formatToolUse(event: any): string {
    const timestamp = new Date().toISOString();
    const tool = event.name || event.tool;
    const args = event.input || event.args || {};
    
    switch (tool) {
      case 'Read':
        let readMsg = `[${timestamp}] 📖 Read: ${args.file_path}`;
        if (args.limit) readMsg += ` (lines ${args.offset || 1}-${(args.offset || 0) + args.limit})`;
        return readMsg;
        
      case 'Bash':
        return `[${timestamp}] 💻 Bash: ${args.command}`;
        
      case 'Grep':
        return `[${timestamp}] 🔍 Grep: "${args.pattern}" in ${args.include || args.path || '*'}`;
        
      case 'Glob':
        return `[${timestamp}] 📁 Glob: ${args.pattern} in ${args.path || '.'}`;
        
      case 'Write':
        return `[${timestamp}] ✏️ Write: ${args.file_path}`;
        
      case 'Edit':
      case 'MultiEdit':
        return `[${timestamp}] ✏️ ${tool}: ${args.file_path}`;
        
      case 'WebFetch':
        return `[${timestamp}] 🌐 WebFetch: ${args.url}`;
        
      case 'Task':
        return `[${timestamp}] 🤖 Task: ${args.description}`;
        
      case 'mcp__squabble-pm__pm_update_tasks':
        const modCount = args.modifications?.length || 0;
        const modTypes = args.modifications?.map((m: any) => m.type).join(', ') || '';
        return `[${timestamp}] 📋 PM Update Tasks: ${modCount} modifications (${modTypes})`;
        
      case 'LS':
        return `[${timestamp}] 📂 LS: ${args.path}`;
        
      default:
        return `[${timestamp}] 🔧 ${tool}: ${JSON.stringify(args)}`;
    }
  }
  
  /**
   * Formats tool result events (optional - for showing what PM found)
   */
  private formatToolResult(event: any): string | null {
    const timestamp = new Date().toISOString();
    
    // Handle both old and new event formats
    const toolName = event.tool || event.name;
    const resultContent = event.content?.[0]?.text || event.result || '';
    
    // Skip empty results
    if (!resultContent || resultContent.trim() === '') {
      return null;
    }
    
    // Only log results for certain tools to avoid clutter
    switch (toolName) {
      case 'Grep':
        const matches = resultContent.match(/\d+ matches?/);
        if (matches) {
          return `[${timestamp}]    └─ Found: ${matches[0]}`;
        }
        break;
        
      case 'Bash':
        if (resultContent.includes('error') || resultContent.includes('Error')) {
          return `[${timestamp}]    └─ Error: ${resultContent.substring(0, 100)}...`;
        }
        // Log success for important commands
        if (event.input?.command && /git|test|lint|npm|yarn/.test(event.input.command)) {
          return `[${timestamp}]    └─ ✓ Command completed successfully`;
        }
        break;
        
      case 'Read':
        const lineCount = resultContent.split('\n').length;
        if (lineCount > 10) {
          return `[${timestamp}]    └─ Read ${lineCount} lines`;
        }
        break;
        
      case 'LS':
        const fileCount = resultContent.split('\n').filter((l: string) => l.trim()).length;
        if (fileCount > 0) {
          return `[${timestamp}]    └─ Found ${fileCount} items`;
        }
        break;
    }
    
    return null;
  }

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
      'mcp__squabble-pm__pm_update_tasks,Read,Write,Edit,MultiEdit,Bash,Grep,Glob,LS,WebFetch,Task',
      '--output-format',
      'stream-json',  // Use structured JSON output for reliable tool usage tracking
      '--verbose'  // Required for stream-json with --print mode
    ];
    
    // Add resume flag if continuing a session
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }
    
    try {
      // Execute claude CLI with prompt via stdin, capturing all output
      const { stdout, stderr, all } = await execa('claude', args, {
        input: prompt,
        all: true  // Capture interleaved stdout and stderr
      });
      
      if (stderr) {
        console.error('Claude CLI stderr:', stderr);
      }
      
      // Log session start
      const sessionStartTime = new Date().toISOString();
      await fs.appendFile(
        path.join(this.workspaceManager.getWorkspaceRoot(), 'pm-activity.log'),
        `\n${'='.repeat(80)}\n[${sessionStartTime}] 🚀 PM Session Started${resumeSessionId ? ' (resumed)' : ''}\n${'='.repeat(80)}\n`
      );
      
      // Log PM activity from the combined output and extract session ID
      let sessionId: string | undefined;
      if (all) {
        const result = await this.logPMActivity(all);
        sessionId = result.sessionId;
      }
      
      if (!stdout || stdout.trim() === '') {
        throw new Error('No response from PM - claude CLI returned empty output');
      }
      
      // Validate we got a session ID from the JSON events
      if (!sessionId) {
        throw new Error('No session ID found in Claude CLI output - expected system init event with session_id');
      }
      
      // Update PM session tracking
      await this.updatePMSession(sessionId, resumeSessionId);
      
      // Log session end
      await fs.appendFile(
        path.join(this.workspaceManager.getWorkspaceRoot(), 'pm-activity.log'),
        `[${new Date().toISOString()}] ✅ PM Session Completed\n${'='.repeat(80)}\n\n`
      );
      
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
   * Updates the PM session tracking - keeps only current session
   * Cleans up previous session file from Claude's project directory
   */
  private async updatePMSession(newSessionId: string, previousSessionId?: string): Promise<void> {
    // If we had a previous session, delete its file
    if (previousSessionId && previousSessionId !== newSessionId) {
      const sessionsDir = this.getProjectSessionsDir();
      const oldSessionFile = path.join(sessionsDir, `${previousSessionId}.jsonl`);
      
      try {
        if (await fs.pathExists(oldSessionFile)) {
          await fs.remove(oldSessionFile);
          console.error(`[Squabble] Cleaned up old session file: ${previousSessionId}`);
        }
      } catch (cleanupError) {
        console.error('[Squabble] Failed to cleanup old session file:', cleanupError);
        // Don't fail the whole operation just for cleanup
      }
    }
    
    // Save only the current session - no history needed
    const session: PMSession = {
      currentSessionId: newSessionId,
      sessionHistory: [newSessionId],  // Keep it simple - just the current session
      createdAt: new Date(),
      lastActive: new Date()
    };
    
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
   * @deprecated Use createPMSystemPromptWithCustom for custom prompt support
   */
  static createPMSystemPrompt(): string {
    // Delegate to the new custom prompt module for backward compatibility
    return createPMSystemPrompt();
  }

  /**
   * Creates the PM system prompt with custom prompt support
   */
  static createPMSystemPromptWithCustom(workspaceRoot: string): string {
    return createPMSystemPrompt(workspaceRoot);
  }
}