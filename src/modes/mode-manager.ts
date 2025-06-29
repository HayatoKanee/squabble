export type SquabbleMode = 'engineer' | 'pm' | 'specialist';

export class ModeManager {
  private mode: SquabbleMode;
  
  constructor() {
    // Check environment variable for mode
    const envMode = process.env.SQUABBLE_MODE?.toLowerCase();
    
    // Default to engineer mode
    this.mode = this.validateMode(envMode) || 'engineer';
    
    console.error(`[Squabble] Running in ${this.mode.toUpperCase()} mode`);
  }
  
  private validateMode(mode?: string): SquabbleMode | null {
    if (mode === 'engineer' || mode === 'pm' || mode === 'specialist') {
      return mode;
    }
    return null;
  }
  
  getMode(): SquabbleMode {
    return this.mode;
  }
  
  isEngineer(): boolean {
    return this.mode === 'engineer';
  }
  
  isPM(): boolean {
    return this.mode === 'pm';
  }
  
  isSpecialist(): boolean {
    return this.mode === 'specialist';
  }
  
  /**
   * Check if current mode has permission for a specific tool
   */
  hasPermission(toolName: string): boolean {
    // PM has access to everything
    if (this.isPM()) {
      return true;
    }
    
    // Engineer restrictions
    if (this.isEngineer()) {
      // Engineers cannot use PM-only tools
      if (toolName === 'pm_update_tasks') {
        return false;
      }
      return true;
    }
    
    // Specialist restrictions (read-only)
    if (this.isSpecialist()) {
      const readOnlyTools = [
        'get_next_task',
        'save_decision',
        'consult_pm'
      ];
      return readOnlyTools.includes(toolName);
    }
    
    return false;
  }
  
  /**
   * Get appropriate error message for permission denial
   */
  getPermissionError(toolName: string): string {
    if (this.isEngineer() && toolName === 'pm_update_tasks') {
      return 'Engineers cannot directly update tasks. Use propose_modification to suggest changes to the PM.';
    }
    
    if (this.isSpecialist()) {
      return 'Specialists have read-only access. Contact the engineer or PM for modifications.';
    }
    
    return `Permission denied: ${this.mode} role cannot use ${toolName}`;
  }
}