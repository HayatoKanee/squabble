import { EventEmitter } from 'events';
import { StreamingPMSessionManager, PMActivityEvent } from '../pm/streaming-session-manager.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { ActivityLogger } from './activity-logger.js';

export interface SessionMetadata {
  id: string;
  startTime: Date;
  endTime?: Date;
  engineerId: string;
  taskId?: string;
  status: 'active' | 'completed' | 'error';
  processId?: number;
}

export interface EnhancedEvent extends PMActivityEvent {
  session?: SessionMetadata;
  sequenceNumber: number;
}

/**
 * File-based event broker for PM sessions
 * Manages streaming from Claude CLI to activity log files
 */
export class FileEventBroker extends EventEmitter {
  private static instance: FileEventBroker;
  
  private sessions: Map<string, StreamingPMSessionManager> = new Map();
  private sessionMetadata: Map<string, SessionMetadata> = new Map();
  private activityLogger?: ActivityLogger;
  private sequenceNumber: number = 0;

  private constructor(
    private workspaceManager: WorkspaceManager
  ) {
    super();
    // Defer ActivityLogger creation until workspace is initialized
  }

  /**
   * Get singleton instance
   */
  static getInstance(workspaceManager: WorkspaceManager): FileEventBroker {
    if (!FileEventBroker.instance) {
      FileEventBroker.instance = new FileEventBroker(workspaceManager);
    }
    return FileEventBroker.instance;
  }

  /**
   * Ensure ActivityLogger is initialized
   */
  private ensureActivityLogger(): ActivityLogger {
    if (!this.activityLogger) {
      this.activityLogger = new ActivityLogger(this.workspaceManager.getWorkspaceRoot());
    }
    return this.activityLogger;
  }

  /**
   * Start a new PM streaming session
   */
  async startPMSession(
    prompt: string,
    systemPrompt: string,
    resumeSessionId?: string,
    metadata?: Partial<SessionMetadata>
  ): Promise<string> {
    const manager = new StreamingPMSessionManager(this.workspaceManager);
    
    // Wire up event forwarding
    manager.on('event', async (event: PMActivityEvent) => {
      const enhanced = this.enhanceEvent(event);
      
      // Persist to file (async, non-blocking)
      // Note: logEvent already handles human-readable logging internally
      this.ensureActivityLogger().logEvent(event).catch(err => 
        console.error('Failed to log event:', err)
      );
      
      // Emit for other listeners (like consult_pm collecting responses)
      this.emit('pm-event', enhanced);
      
      // Update session metadata on end
      if (event.type === 'session_end' && event.sessionId) {
        const meta = this.sessionMetadata.get(event.sessionId);
        if (meta) {
          meta.status = 'completed';
          meta.endTime = new Date();
        }
      }
    });
    
    // Start the session
    const { sessionId, process } = await manager.consultPMStreaming(
      prompt, 
      systemPrompt, 
      resumeSessionId
    );
    
    // Store session manager and metadata
    this.sessions.set(sessionId, manager);
    this.sessionMetadata.set(sessionId, {
      id: sessionId,
      startTime: new Date(),
      engineerId: metadata?.engineerId || 'unknown',
      taskId: metadata?.taskId,
      status: 'active',
      processId: process.pid
    });
    
    return sessionId;
  }

  /**
   * Enhance event with metadata and sequence number
   */
  private enhanceEvent(event: PMActivityEvent): EnhancedEvent {
    const metadata = event.sessionId ? 
      this.sessionMetadata.get(event.sessionId) : 
      undefined;
    
    return {
      ...event,
      session: metadata,
      sequenceNumber: this.sequenceNumber++
    };
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SessionMetadata[] {
    return Array.from(this.sessionMetadata.values())
      .filter(s => s.status === 'active');
  }

  /**
   * Get session metadata
   */
  getSessionMetadata(sessionId: string): SessionMetadata | undefined {
    return this.sessionMetadata.get(sessionId);
  }

  /**
   * Stop a specific session
   */
  stopSession(sessionId: string): void {
    const manager = this.sessions.get(sessionId);
    if (manager) {
      manager.stopCurrentSession();
      this.sessions.delete(sessionId);
      
      const metadata = this.sessionMetadata.get(sessionId);
      if (metadata) {
        metadata.status = 'completed';
        metadata.endTime = new Date();
      }
    }
  }

  /**
   * Stop all sessions and clean up
   */
  async shutdown(): Promise<void> {
    // Stop all sessions
    for (const [sessionId, manager] of this.sessions) {
      manager.stopCurrentSession();
    }
    
    // Close activity logger if initialized
    if (this.activityLogger) {
      await this.activityLogger.close();
    }
    
    // Clear data
    this.sessions.clear();
    this.sessionMetadata.clear();
  }

  /**
   * Load recent events from disk on startup
   */
  async loadRecentEvents(): Promise<void> {
    // This method is kept for compatibility but not needed for file-based streaming
    // Events are always read from file when needed
  }
}