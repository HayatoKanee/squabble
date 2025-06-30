import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { WorkspaceManager } from '../workspace/manager.js';
import { TemplateService } from '../templates/template-service.js';
import { EXAMPLE_CUSTOM_PM_PROMPT } from '../pm/custom-prompt.js';
import fs from 'fs-extra';
import path from 'path';

const initWorkspaceSchema = z.object({
  projectDescription: z.string().optional().describe('Brief description of the project'),
  enableBackgroundTasks: z.boolean().optional().default(true).describe('Enable background task execution'),
  forceAutoBackgroundTasks: z.boolean().optional().default(true).describe('Force auto background tasks'),
  createExamplePMPrompt: z.boolean().optional().default(false).describe('Create example custom PM prompt')
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
        
        // Initialize template service and ensure templates exist
        try {
          const templateService = new TemplateService(workspaceManager.getWorkspaceRoot());
          await templateService.ensureTemplatesExist();
          console.log('Templates initialized successfully');
        } catch (templateError) {
          console.error('Failed to initialize templates:', templateError);
          // Continue with initialization even if templates fail
          // Templates are helpful but not critical for workspace functionality
        }
        
        // Create prompts directory
        const promptsDir = path.join(workspaceManager.getWorkspaceRoot(), 'workspace', 'prompts');
        await fs.ensureDir(promptsDir);
        
        // Create example custom PM prompt if requested
        if (args.createExamplePMPrompt) {
          const examplePromptPath = path.join(promptsDir, 'pm.md.example');
          await fs.writeFile(examplePromptPath, EXAMPLE_CUSTOM_PM_PROMPT, 'utf-8');
          console.log('Created example custom PM prompt at:', examplePromptPath);
        }
        
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
- \`apply_modifications\` - Apply approved task modifications
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

This directory contains the Squabble workspace for your project.

## Project Information
- **Description**: ${args.projectDescription || 'No description provided'}
- **Initialized**: ${new Date().toISOString()}
- **Settings**: Background tasks ${args.enableBackgroundTasks ? 'enabled' : 'disabled'}, Auto tasks ${args.forceAutoBackgroundTasks ? 'enabled' : 'disabled'}

## Directory Structure

\`\`\`
.squabble/
├── workspace/
│   ├── tasks/          # Task list managed by PM
│   ├── plans/          # Implementation plans for tasks
│   ├── reviews/        # Code review history
│   ├── prompts/        # Custom PM prompts (optional)
│   ├── context/        # Project metadata
│   ├── templates/      # Document templates
│   └── decisions/      # Architectural decision records
├── pm-activity.log     # Audit trail of PM actions
├── pm-activity.jsonl   # Structured PM activity log
└── sessions/           # PM session tracking
\`\`\`

## Customization Options

### Custom PM Prompts
Place a \`pm.md\` file in \`workspace/prompts/\` to customize PM behavior:
- Add domain-specific expertise (e.g., fintech, healthcare)
- Define custom review standards
- Set project-specific priorities

Example: \`workspace/prompts/pm.md.example\` (if created during init)

### Document Templates
Templates in \`workspace/templates/\` are used for:
- \`implementation-plan.md\` - Auto-generated when claiming tasks
- \`implementation-report.md\` - For structured review submissions
- \`review.md\` - PM review responses

Edit these templates to match your project's needs.

## Log Files

### pm-activity.log
Human-readable log of all PM actions:
- Tool usage (Read, Grep, etc.)
- Key decisions and findings
- Session start/end markers

### pm-activity.jsonl
Structured JSON log for programmatic analysis:
- Detailed tool parameters
- Session IDs for continuity
- Timestamps for all events

## For Developers

The workspace is designed to be version-controlled. Consider:
- Commit \`tasks/\` to track project progress
- Commit \`decisions/\` to preserve architectural choices
- Optionally gitignore logs if they become too large

For more information, see the main project documentation.
`;
        
        await fs.writeFile(readmePath, readmeContent, 'utf-8');
        
        return `Squabble workspace initialized successfully!

✅ Created .squabble workspace at: ${workspaceManager.getWorkspaceRoot()}
✅ Created .claude/settings.local.json with background tasks ${args.enableBackgroundTasks ? 'enabled' : 'disabled'}
✅ Created CLAUDE.md with project context
✅ Initialized templates directory with default templates
✅ Created prompts directory for custom PM prompts

Templates created in .squabble/templates/:
- implementation-plan.md: For engineers to submit their implementation plans
- implementation-report.md: For engineers to report implementation completion
- review.md: For PM review feedback

${args.createExamplePMPrompt ? '📝 Example custom PM prompt created at: .squabble/workspace/prompts/pm.md.example\nRename to pm.md to activate custom PM personality\n\n' : ''}Custom PM Prompts:
- To customize PM behavior, create: .squabble/workspace/prompts/pm.md
- The custom prompt will replace PM's default instructions while keeping core functionality

You are now the Product Manager (PM) because you have access to Squabble MCP tools.
Specialists you spawn will automatically know they are specialists based on their system prompts.`;
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
        return `Error: ${error instanceof Error ? error.message : 'Failed to initialize workspace'}`;
      }
    }
  });
}