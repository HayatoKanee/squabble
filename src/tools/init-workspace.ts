import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { WorkspaceManager } from '../workspace/manager.js';
import fs from 'fs-extra';
import path from 'path';

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
        
        // Create Claude settings for background tasks in project root
        const projectRoot = process.cwd();
        const claudeSettingsDir = path.join(projectRoot, '.claude');
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
        if (!settings.env) {
          settings.env = {};
        }
        
        if (args.enableBackgroundTasks) {
          settings.env.ENABLE_BACKGROUND_TASKS = "true";
        }
        if (args.forceAutoBackgroundTasks) {
          settings.env.FORCE_AUTO_BACKGROUND_TASKS = "true";
        }
        
        // Write settings
        await fs.writeFile(
          settingsPath,
          JSON.stringify(settings, null, 2),
          'utf-8'
        );
        
        // Create CLAUDE.md from template
        const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
        const templatePath = path.join(projectRoot, 'templates', 'CLAUDE.md.template');
        
        let claudeMdContent: string;
        try {
          // Try to read template
          claudeMdContent = await fs.readFile(templatePath, 'utf-8');
        } catch {
          // Fallback if template doesn't exist
          claudeMdContent = `# Squabble Project Context

This is a Squabble-managed project where AI agents collaborate through structured debates before implementation.

## Project Information
- **Description**: {{PROJECT_DESCRIPTION}}
- **Initialized**: {{INITIALIZED_DATE}}
- **Workspace**: .squabble/

## Architecture Overview
Squabble uses a multi-agent architecture:
- **Product Manager (PM)**: The orchestrator who interfaces with users and coordinates specialists
- **Engineer**: Technical implementation specialist
- **Security**: Security analysis specialist  
- **Architect**: System design specialist

## Your Role

### If you have access to Squabble MCP tools:
You are operating as the **Product Manager (PM)**. Your responsibilities:
- Interface directly with users
- Spawn and coordinate specialist agents
- Manage the dynamic task list
- Make final technical decisions
- Synthesize specialist feedback

Use these MCP tools:
- \`spawn_agent\` - Create specialists (engineer, security, architect)
- \`send_to_agent\` - Communicate with specialists
- \`update_tasks\` - Manage dynamic task list
- \`save_decision\` - Document decisions
- \`get_agent_status\` - Check specialist status
- \`debate_status\` - View project status

### If you were spawned by the PM:
You are a specialist agent. Your system prompt defines your specific role and responsibilities. Focus on providing expert analysis to the PM who spawned you.

## Project Standards
- Prioritize thoughtful analysis over hasty implementation
- Challenge assumptions and propose alternatives
- Document decisions with clear rationale
- Maintain high code quality standards
- Consider security implications early

## Current Project State
Check \`.squabble/workspace/context/project.json\` for current project metadata and settings.`;
        }
        
        // Replace placeholders
        claudeMdContent = claudeMdContent
          .replace('{{PROJECT_DESCRIPTION}}', args.projectDescription || 'No description provided')
          .replace('{{INITIALIZED_DATE}}', new Date().toISOString());
        
        await fs.writeFile(claudeMdPath, claudeMdContent, 'utf-8');
        
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
        
        return `Squabble workspace initialized successfully!

✅ Created .squabble workspace at: ${workspaceManager.getWorkspaceRoot()}
✅ Created .claude/settings.local.json with background tasks ${args.enableBackgroundTasks ? 'enabled' : 'disabled'}
✅ Created CLAUDE.md with project context

You are now the Product Manager (PM) because you have access to Squabble MCP tools.
Specialists you spawn will automatically know they are specialists based on their system prompts.`;
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to initialize workspace'}`;
      }
    }
  });
}