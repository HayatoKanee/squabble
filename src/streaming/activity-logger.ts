import fs from 'fs';
import path from 'path';
import { PMActivityEvent } from '../pm/streaming-session-manager.js';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import * as readline from 'readline';

/**
 * Non-blocking activity logger for persistent storage
 * Writes events to JSONL file with streaming writes
 */
export class ActivityLogger {
  private writeStream?: fs.WriteStream;
  private humanWriteStream?: fs.WriteStream;
  private readonly activityFile: string;
  private readonly humanReadableFile: string;
  private isInitialized: boolean = false;
  
  // Log rotation configuration
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_SESSIONS_TO_KEEP = 5;

  constructor(private workspaceRoot: string) {
    this.activityFile = path.join(workspaceRoot, 'pm-activity.jsonl');
    this.humanReadableFile = path.join(workspaceRoot, 'pm-activity.log');
  }

  /**
   * Initialize write streams
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Check if log rotation is needed before opening streams
    await this.rotateLogsIfNeeded();

    // Create write stream for JSONL file
    this.writeStream = fs.createWriteStream(this.activityFile, {
      flags: 'a', // Append mode
      encoding: 'utf8',
      highWaterMark: 16384 // 16KB buffer
    });

    // Handle stream errors
    this.writeStream.on('error', (error) => {
      console.error('Activity logger write error:', error);
    });

    // Create write stream for human-readable file
    this.humanWriteStream = fs.createWriteStream(this.humanReadableFile, {
      flags: 'a',
      encoding: 'utf8',
      highWaterMark: 16384
    });

    this.humanWriteStream.on('error', (error) => {
      console.error('Activity logger human write error:', error);
    });

    this.isInitialized = true;
  }

  /**
   * Log an event asynchronously
   */
  async logEvent(event: PMActivityEvent): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Write to JSONL file
    const line = JSON.stringify(event) + '\n';
    
    // Also log in human-readable format
    this.logEventHumanReadable(event).catch(err => {
      // Don't fail if human-readable logging fails
      console.error('Human-readable logging failed:', err);
    });
    
    return new Promise((resolve, reject) => {
      if (!this.writeStream) {
        reject(new Error('Write stream not initialized'));
        return;
      }

      const canWrite = this.writeStream.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // If buffer is full, wait for drain
      if (!canWrite) {
        this.writeStream.once('drain', () => resolve());
      }
    });
  }

  /**
   * Log human-readable format (async, best-effort)
   */
  async logHumanReadable(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    
    try {
      await fs.promises.appendFile(this.humanReadableFile, line);
    } catch (error) {
      // Best effort - don't fail on human-readable log errors
      console.error('Failed to write human-readable log:', error);
    }
  }

  /**
   * Format and log event in human-readable form
   */
  async logEventHumanReadable(event: PMActivityEvent): Promise<void> {
    let message = '';

    switch (event.type) {
      case 'session_start':
        message = `🚀 PM Session Started (ID: ${event.sessionId})`;
        await this.logHumanReadable('='.repeat(80));
        await this.logHumanReadable(message);
        await this.logHumanReadable('='.repeat(80));
        return;

      case 'session_end':
        message = `✅ PM Session Completed`;
        await this.logHumanReadable(message);
        await this.logHumanReadable('='.repeat(80) + '\n');
        return;

      case 'tool_use':
        message = `🔧 ${event.message || event.tool}`;
        break;

      case 'tool_result':
        message = `   └─ ${event.message || event.result}`;
        break;

      case 'pm_message':
        message = `💬 PM: ${event.message || ''}`;
        break;

      case 'error':
        message = `❌ Error: ${event.message}`;
        break;

      default:
        message = event.message || JSON.stringify(event);
    }

    await this.logHumanReadable(message);
  }

  /**
   * Flush any pending writes
   */
  async flush(): Promise<void> {
    if (!this.writeStream) return;

    return new Promise((resolve) => {
      this.writeStream!.end(() => resolve());
    });
  }

  /**
   * Close the logger
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      await this.flush();
      this.writeStream = undefined;
    }
    this.isInitialized = false;
  }

  /**
   * Read recent events from file (for initial load)
   */
  async readRecentEvents(limit: number = 100): Promise<PMActivityEvent[]> {
    try {
      const content = await fs.promises.readFile(this.activityFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const events: PMActivityEvent[] = [];
      
      // Read from end for most recent
      for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
        try {
          const event = JSON.parse(lines[i]);
          events.unshift(event); // Add to beginning to maintain order
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
      
      return events;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if log rotation is needed based on file size
   */
  private async rotateLogsIfNeeded(): Promise<void> {
    try {
      const stats = await fs.promises.stat(this.activityFile);
      if (stats.size > this.MAX_FILE_SIZE) {
        console.log(`[ActivityLogger] Log file exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB, rotating...`);
        await this.rotateLogs();
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist yet, no rotation needed
        return;
      }
      console.error('[ActivityLogger] Error checking log file size:', error);
    }
  }

  /**
   * Rotate logs by keeping only the most recent sessions
   */
  private async rotateLogs(): Promise<void> {
    const tempJsonlFile = this.activityFile + '.tmp';
    const tempLogFile = this.humanReadableFile + '.tmp';
    
    try {
      // Parse sessions from JSONL file
      const sessions = await this.parseSessionsFromFile();
      
      // Keep only the most recent sessions
      const sessionsToKeep = sessions.slice(-this.MAX_SESSIONS_TO_KEEP);
      
      if (sessionsToKeep.length === 0) {
        // No sessions to keep, just truncate files
        await fs.promises.writeFile(this.activityFile, '');
        await fs.promises.writeFile(this.humanReadableFile, '');
        console.log('[ActivityLogger] Log files truncated - no sessions found');
        return;
      }
      
      // Write retained sessions to temp files
      await this.writeSessionsToFile(sessionsToKeep, tempJsonlFile, tempLogFile);
      
      // Atomically replace original files
      await fs.promises.rename(tempJsonlFile, this.activityFile);
      await fs.promises.rename(tempLogFile, this.humanReadableFile);
      
      console.log(`[ActivityLogger] Log rotation complete. Kept ${sessionsToKeep.length} sessions`);
    } catch (error) {
      // Clean up temp files on error
      try {
        await fs.promises.unlink(tempJsonlFile).catch(() => {});
        await fs.promises.unlink(tempLogFile).catch(() => {});
      } catch {}
      
      console.error('[ActivityLogger] Log rotation failed:', error);
      throw error;
    }
  }

  /**
   * Parse sessions from the JSONL file
   */
  private async parseSessionsFromFile(): Promise<Array<{sessionId: string, events: PMActivityEvent[]}>> {
    const sessions = new Map<string, PMActivityEvent[]>();
    const sessionOrder: string[] = [];
    
    const fileStream = createReadStream(this.activityFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    for await (const line of rl) {
      if (!line.trim()) continue;
      
      try {
        const event = JSON.parse(line) as PMActivityEvent;
        const sessionId = event.sessionId || 'unknown';
        
        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, []);
          sessionOrder.push(sessionId);
        }
        
        sessions.get(sessionId)!.push(event);
      } catch (e) {
        // Skip invalid JSON lines
      }
    }
    
    // Return sessions in order they were first seen
    return sessionOrder.map(sessionId => ({
      sessionId,
      events: sessions.get(sessionId)!
    }));
  }

  /**
   * Write sessions to new files
   */
  private async writeSessionsToFile(
    sessions: Array<{sessionId: string, events: PMActivityEvent[]}>,
    jsonlPath: string,
    logPath: string
  ): Promise<void> {
    const jsonlStream = createWriteStream(jsonlPath);
    const logStream = createWriteStream(logPath);
    
    try {
      for (const session of sessions) {
        for (const event of session.events) {
          // Write to JSONL
          jsonlStream.write(JSON.stringify(event) + '\n');
          
          // Write to human-readable log
          const humanReadable = await this.formatEventForHumanLog(event);
          if (humanReadable) {
            logStream.write(humanReadable);
          }
        }
      }
      
      // Wait for streams to finish
      await new Promise<void>((resolve, reject) => {
        jsonlStream.end((err: Error | null | undefined) => err ? reject(err) : resolve());
      });
      
      await new Promise<void>((resolve, reject) => {
        logStream.end((err: Error | null | undefined) => err ? reject(err) : resolve());
      });
    } catch (error) {
      jsonlStream.destroy();
      logStream.destroy();
      throw error;
    }
  }

  /**
   * Format an event for the human-readable log
   */
  private async formatEventForHumanLog(event: PMActivityEvent): Promise<string> {
    const timestamp = event.timestamp || new Date().toISOString();
    let message = '';

    switch (event.type) {
      case 'session_start':
        message = `[${timestamp}] ${'='.repeat(80)}\n`;
        message += `[${timestamp}] 🚀 PM Session Started (ID: ${event.sessionId})\n`;
        message += `[${timestamp}] ${'='.repeat(80)}\n`;
        break;

      case 'session_end':
        message = `[${timestamp}] ✅ PM Session Completed\n`;
        message += `[${timestamp}] ${'='.repeat(80)}\n\n`;
        break;

      case 'tool_use':
        message = `[${timestamp}] 🔧 ${event.message || event.tool}\n`;
        break;

      case 'tool_result':
        message = `[${timestamp}]    └─ ${event.message || event.result}\n`;
        break;

      case 'pm_message':
        message = `[${timestamp}] 💬 PM: ${event.message || ''}\n`;
        break;

      case 'error':
        message = `[${timestamp}] ❌ Error: ${event.message}\n`;
        break;

      default:
        message = `[${timestamp}] ${event.message || JSON.stringify(event)}\n`;
    }

    return message;
  }
}