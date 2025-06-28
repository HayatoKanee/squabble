import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { AgentSession } from '../types.js';

export class SessionManager {
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

  async findLatestSession(): Promise<string> {
    try {
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

  async sendToAgent(sessionId: string, message: string): Promise<string> {
    try {
      // Resume the session with the new message
      const { stdout } = await execa('claude', [
        '-p',
        '--resume',
        sessionId,
        message
      ]);

      return stdout;
    } catch (error) {
      console.error('Error sending to agent:', error);
      throw new Error('Failed to send message to agent');
    }
  }

  async updateSession(session: AgentSession): Promise<AgentSession> {
    // Find the new session ID (created by --resume)
    const newSessionId = await this.findLatestSession();

    // Update session object
    return {
      ...session,
      currentSessionId: newSessionId,
      sessionHistory: [...session.sessionHistory, newSessionId],
      messageCount: session.messageCount + 1,
      lastActive: new Date()
    };
  }

  async getSessionContent(sessionId: string): Promise<any[]> {
    try {
      const sessionPath = path.join(this.claudeProjectPath, `${sessionId}.jsonl`);
      const content = await fs.readFile(sessionPath, 'utf-8');
      
      // Parse JSONL format (each line is a JSON object)
      const lines = content.trim().split('\n');
      return lines
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      console.error('Error reading session:', error);
      return [];
    }
  }

  async extractLastResponse(sessionId: string): Promise<string> {
    const sessionContent = await this.getSessionContent(sessionId);
    
    // Find the last assistant message
    for (let i = sessionContent.length - 1; i >= 0; i--) {
      const entry = sessionContent[i];
      if (entry.type === 'assistant' && entry.message?.content) {
        // Extract text content
        const content = entry.message.content;
        if (Array.isArray(content)) {
          const textContent = content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          return textContent;
        }
        return content;
      }
    }

    return '';
  }
}