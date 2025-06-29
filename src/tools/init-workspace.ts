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

This is a Squabble-managed project using an engineer-driven sequential workflow with PM collaboration.

## Project Information
- **Description**: {{PROJECT_DESCRIPTION}}
- **Initialized**: {{INITIALIZED_DATE}}
- **Workspace**: .squabble/

## Architecture Overview
Squabble uses a sequential engineer-PM workflow:
- **Lead Engineer**: You (Claude) - drives implementation and technical decisions
- **Product Manager (PM)**: Advisor who refines requirements and reviews work
- **Specialists** (optional): Security, Architect advisors for specific expertise

## Your Role as Lead Engineer

You are the Lead Engineer driving the implementation. Your workflow:

1. **Consult PM** - Use \`consult_pm\` to discuss requirements and get clarity
2. **Get Tasks** - Use \`get_next_task\` to find your next priority
3. **Claim Tasks** - Use \`claim_task\` to mark a task as in-progress
4. **Submit Work** - Use \`submit_for_review\` for blocking PM review
5. **Propose Changes** - Use \`propose_modification\` to evolve the task list

### Key Principles:
- You own the implementation and make technical decisions
- PM is your partner for requirements and quality
- Reviews are blocking - wait for PM feedback before proceeding
- Task list is dynamic - propose changes when needed
- One task at a time - complete before starting the next

### MCP Tools Available:
- \`init_workspace\` - Initialize project (already done)
- \`consult_pm\` - Discuss with PM, maintain conversation context
- \`get_next_task\` - Find highest priority available task
- \`claim_task\` - Mark task as in-progress
- \`submit_for_review\` - Submit work for PM review (blocking)
- \`propose_modification\` - Suggest task list changes
- \`update_tasks\` - Apply approved task modifications
- \`save_decision\` - Document architectural decisions

## Workflow Example:
\`\`\`
1. Engineer: consult_pm("I need to implement user authentication...")
2. PM: "Good question. Let's use JWT tokens..."
3. Engineer: get_next_task() → "Implement JWT auth"
4. Engineer: claim_task("task-123")
5. Engineer: [implements the feature]
6. Engineer: submit_for_review("task-123", "Implemented JWT auth...")
7. PM: "Approved! Consider adding refresh tokens next"
8. Engineer: propose_modification("Add task for refresh tokens...")
\`\`\`

## Project Standards
- Complete one task before starting another
- Always get PM review before marking tasks complete
- Document important decisions
- Propose task changes when dependencies are wrong
- Keep PM informed of blockers or concerns

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