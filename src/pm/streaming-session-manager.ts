import { spawn, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { PMSession } from '../types.js';
import { WorkspaceManager } from '../workspace/manager.js';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import readline from 'readline';
import { env } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MCP configuration for PM server
const isDevelopment = env.NODE_ENV === 'development' || !env.NODE_ENV;
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

export interface PMActivityEvent {
  timestamp: string;
  type: 'session_start' | 'tool_use' | 'tool_result' | 'pm_message' | 'session_end' | 'error';
  sessionId?: string;
  tool?: string;
  args?: any;
  result?: string;
  message?: string;
  id?: string;
}

/**
 * Enhanced PM Session Manager with real-time streaming
 */
export class StreamingPMSessionManager extends EventEmitter {
  private activeProcess?: ChildProcess;
  private currentSessionId?: string;

  constructor(private workspaceManager: WorkspaceManager) {
    super();
  }

  /**
   * Spawns a PM session with real-time streaming
   */
  async consultPMStreaming(
    prompt: string,
    systemPrompt: string,
    resumeSessionId?: string
  ): Promise<{ sessionId: string; process: ChildProcess }> {
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
      'stream-json',
      '--verbose'
    ];
    
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    // Spawn claude process
    const claudeProcess = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.activeProcess = claudeProcess;

    // Write the prompt to stdin
    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();

    // Set up streaming for stdout
    this.setupStreaming(claudeProcess);

    // Handle errors
    claudeProcess.on('error', (error) => {
      this.emit('event', {
        timestamp: new Date().toISOString(),
        type: 'error',
        message: `Process error: ${error.message}`,
        sessionId: this.currentSessionId
      });
    });

    claudeProcess.on('exit', (code, signal) => {
      if (this.currentSessionId) {
        this.emit('event', {
          timestamp: new Date().toISOString(),
          type: 'session_end',
          sessionId: this.currentSessionId,
          message: `Process exited with code ${code}`
        });
      }
      this.activeProcess = undefined;
    });

    // Wait for session ID from the stream
    const sessionId = await this.waitForSessionId(claudeProcess);
    this.currentSessionId = sessionId;

    return { sessionId, process: claudeProcess };
  }

  /**
   * Set up real-time streaming of JSON events
   */
  private setupStreaming(process: ChildProcess) {
    if (!process.stdout) return;

    const rl = readline.createInterface({
      input: process.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;

      try {
        const event = JSON.parse(line);
        // Debug logging to see what events we're getting
        if (env.DEBUG_STREAMING) {
          console.log('[Stream Debug] Event type:', event.type, 'subtype:', event.subtype);
        }
        this.handleStreamEvent(event);
      } catch (error) {
        // Not JSON, might be plain text output
        console.error('Failed to parse JSON line:', line);
      }
    });

    // Also handle stderr
    if (process.stderr) {
      const rlErr = readline.createInterface({
        input: process.stderr,
        crlfDelay: Infinity
      });

      rlErr.on('line', (line) => {
        console.error('PM stderr:', line);
      });
    }
  }

  /**
   * Handle a streaming event from Claude CLI
   */
  private handleStreamEvent(event: any) {
    const timestamp = new Date().toISOString();

    switch (event.type) {
      case 'system':
        if (event.subtype === 'init' && event.session_id) {
          this.currentSessionId = event.session_id;
          this.emit('event', {
            timestamp,
            type: 'session_start',
            sessionId: event.session_id,
            message: `PM Session Started (ID: ${event.session_id})`
          } as PMActivityEvent);
        }
        break;

      case 'tool_use':
        this.emit('event', {
          timestamp,
          type: 'tool_use',
          sessionId: this.currentSessionId,
          tool: event.name,
          args: event.input,
          id: event.id,
          message: this.formatToolUse(event)
        } as PMActivityEvent);
        break;

      case 'tool_result':
        const resultSummary = this.formatToolResult(event);
        if (resultSummary) {
          this.emit('event', {
            timestamp,
            type: 'tool_result',
            sessionId: this.currentSessionId,
            id: event.tool_use_id,
            result: resultSummary,
            message: resultSummary
          } as PMActivityEvent);
        }
        break;

      case 'content':
        if (event.text && event.text.trim()) {
          this.emit('event', {
            timestamp,
            type: 'pm_message',
            sessionId: this.currentSessionId,
            message: event.text
          } as PMActivityEvent);
        }
        break;

      case 'assistant':
        // Handle assistant messages from stream-json format
        if (event.message && event.message.content) {
          // Extract text content from the assistant message
          const textContent = event.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          
          if (textContent.trim()) {
            this.emit('event', {
              timestamp,
              type: 'pm_message',
              sessionId: this.currentSessionId,
              message: textContent
            } as PMActivityEvent);
          }
        }
        break;

      case 'user':
        // Handle tool results that come back as user messages
        if (event.message && event.message.content) {
          event.message.content.forEach((content: any) => {
            if (content.type === 'tool_result') {
              // Extract the actual result content
              let resultContent = '';
              if (typeof content.content === 'string') {
                resultContent = content.content;
              } else if (Array.isArray(content.content)) {
                // Handle array of content blocks
                resultContent = content.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join('\n');
              }
              
              if (resultContent) {
                this.emit('event', {
                  timestamp,
                  type: 'tool_result',
                  sessionId: this.currentSessionId,
                  id: content.tool_use_id,
                  result: resultContent,
                  message: this.formatToolResultForDisplay(resultContent)
                } as PMActivityEvent);
              }
            }
          });
        }
        break;
    }
  }

  /**
   * Wait for session ID from the stream
   */
  private waitForSessionId(process: ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for session ID'));
      }, 10000);

      const checkSessionId = () => {
        if (this.currentSessionId) {
          clearTimeout(timeout);
          resolve(this.currentSessionId);
        } else {
          setTimeout(checkSessionId, 100);
        }
      };

      checkSessionId();
    });
  }

  /**
   * Format tool use for display
   */
  private formatToolUse(event: any): string {
    const tool = event.name;
    const args = event.input || {};

    switch (tool) {
      case 'Read':
        return `Read: ${args.file_path}`;
      case 'Bash':
        return `Bash: ${args.command}`;
      case 'Grep':
        return `Grep: "${args.pattern}" in ${args.include || args.path || '*'}`;
      case 'mcp__squabble-pm__pm_update_tasks':
        const modCount = args.modifications?.length || 0;
        const modTypes = args.modifications?.map((m: any) => m.type).join(', ') || '';
        return `PM Update Tasks: ${modCount} modifications (${modTypes})`;
      default:
        return `${tool}: ${JSON.stringify(args)}`;
    }
  }

  /**
   * Format tool result for display
   */
  private formatToolResult(event: any): string | null {
    const toolName = event.tool || event.name;
    const resultContent = event.content?.[0]?.text || event.result || '';

    if (!resultContent || resultContent.trim() === '') {
      return null;
    }

    // Don't truncate result content for logs
    const preview = resultContent;

    switch (toolName) {
      case 'Grep':
        const matches = resultContent.match(/\d+ matches?/);
        if (matches) return `Found: ${matches[0]}`;
        return `Grep result: ${preview}`;
      case 'Read':
        const lineCount = resultContent.split('\n').length;
        return `Read ${lineCount} lines from file`;
      case 'LS':
        const items = resultContent.split('\n').filter((l: string) => l.trim()).length;
        return `Found ${items} items`;
      case 'Bash':
        // Only treat as error if it's actually a command error
        if ((resultContent.includes('command not found') || 
             resultContent.includes('No such file') ||
             resultContent.includes('Permission denied') ||
             resultContent.includes('fatal:') ||
             resultContent.startsWith('Error:')) && 
            resultContent.length < 500) { // Short messages are more likely to be errors
          return `Error: ${resultContent}`;
        }
        return `Command output: ${preview}`;
      default:
        return `${toolName} result: ${preview}`;
    }
  }

  /**
   * Format tool result for display from content
   */
  private formatToolResultForDisplay(resultContent: string): string {
    // Try to extract meaningful summary
    const lineMatch = resultContent.match(/(\d+) lines?/);
    if (lineMatch) {
      return `Read ${lineMatch[1]} lines`;
    }
    
    const matchesMatch = resultContent.match(/(\d+) matches?/);
    if (matchesMatch) {
      return `Found ${matchesMatch[1]} match${matchesMatch[1] === '1' ? '' : 'es'}`;
    }
    
    const itemsMatch = resultContent.match(/(\d+) items?/);
    if (itemsMatch) {
      return `Listed ${itemsMatch[1]} item${itemsMatch[1] === '1' ? '' : 's'}`;
    }
    
    // Only treat as error if it looks like an actual error message
    if ((resultContent.includes('error:') || resultContent.includes('Error:') || 
         resultContent.startsWith('Error ') || resultContent.startsWith('error ')) &&
        !resultContent.includes('import ')) {
      return `Error: ${resultContent}`;
    }
    
    // Return full result content
    return resultContent;
  }

  /**
   * Stop the current PM session
   */
  stopCurrentSession() {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill();
      this.activeProcess = undefined;
    }
  }
}