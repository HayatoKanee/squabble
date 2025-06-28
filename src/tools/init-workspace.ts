import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { WorkspaceManager } from '../workspace/manager.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const initWorkspaceSchema = z.object({
  projectDescription: z.string().optional().describe('Brief description of the project'),
  enableBackgroundTasks: z.boolean().optional().default(true).describe('Enable background task execution'),
  forceAutoBackgroundTasks: z.boolean().optional().default(true).describe('Force auto background tasks')
});

export function registerInitWorkspace(
  server: FastMCP,
  workspaceManager: WorkspaceManager
) {
  server.addTool({
    name: 'init_workspace',
    description: 'Initialize Squabble workspace and configure settings for the project',
    parameters: initWorkspaceSchema,
    execute: async (args) => {
      try {
        // Initialize workspace structure
        await workspaceManager.initialize();
        
        // Create project metadata
        const projectMeta = {
          initialized: new Date().toISOString(),
          description: args.projectDescription || 'Squabble-managed project',
          settings: {
            enableBackgroundTasks: args.enableBackgroundTasks,
            forceAutoBackgroundTasks: args.forceAutoBackgroundTasks
          }
        };
        
        await workspaceManager.saveContext('project', projectMeta);
        
        // Create Claude settings for background tasks
        const claudeSettingsDir = path.join(os.homedir(), '.claude');
        const settingsPath = path.join(claudeSettingsDir, 'settings.local.json');
        
        // Ensure .claude directory exists
        await fs.ensureDir(claudeSettingsDir);
        
        // Read existing settings or create new
        let settings: any = {};
        try {
          if (await fs.pathExists(settingsPath)) {
            const content = await fs.readFile(settingsPath, 'utf-8');
            settings = JSON.parse(content);
          }
        } catch (error) {
          // Invalid JSON or read error, start fresh
          settings = {};
        }
        
        // Update settings for background tasks if requested
        if (args.enableBackgroundTasks) {
          settings.ENABLE_BACKGROUND_TASKS = "true";
        }
        if (args.forceAutoBackgroundTasks) {
          settings.FORCE_AUTO_BACKGROUND_TASKS = "true";
        }
        
        // Write settings
        await fs.writeFile(
          settingsPath,
          JSON.stringify(settings, null, 2),
          'utf-8'
        );
        
        // Create initial README in workspace
        const readmePath = path.join(workspaceManager.getWorkspaceRoot(), 'README.md');
        const readmeContent = `# Squabble Workspace

This project is managed by Squabble - AI agents that debate before they code.

## Project Description
${args.projectDescription || 'No description provided'}

## Settings
- Background Tasks: ${args.enableBackgroundTasks ? 'Enabled' : 'Disabled'}
- Auto Background Tasks: ${args.forceAutoBackgroundTasks ? 'Enabled' : 'Disabled'}

## Structure
- \`workspace/\` - Active project files
  - \`requirements/\` - Evolving requirements
  - \`designs/\` - Architecture proposals
  - \`decisions/\` - Decision records
  - \`tasks/\` - Dynamic task list
  - \`debates/\` - Agent debates
  - \`context/\` - Project context
- \`sessions/\` - Agent session tracking
- \`archive/\` - Completed debates

## Usage
Use Squabble MCP tools to:
- \`spawn_agent\` - Create specialist agents
- \`send_to_agent\` - Communicate with agents
- \`update_tasks\` - Manage tasks
- \`save_decision\` - Document decisions

Initialized: ${new Date().toISOString()}
`;
        
        await fs.writeFile(readmePath, readmeContent, 'utf-8');
        
        return `Squabble workspace initialized successfully at ${workspaceManager.getWorkspaceRoot()}
Settings updated: Background tasks ${args.enableBackgroundTasks ? 'enabled' : 'disabled'}`;
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to initialize workspace'}`;
      }
    }
  });
}