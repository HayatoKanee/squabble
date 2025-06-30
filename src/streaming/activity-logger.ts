import fs from 'fs';
import path from 'path';
import { PMActivityEvent } from '../pm/streaming-session-manager.js';

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

  constructor(private workspaceRoot: string) {
    this.activityFile = path.join(workspaceRoot, 'pm-activity.jsonl');
    this.humanReadableFile = path.join(workspaceRoot, 'pm-activity.log');
  }

  /**
   * Initialize write streams
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

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
}