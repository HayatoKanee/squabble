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
          claudeMdContent = `# SQUABBLE PROJECT - CRITICAL WORKFLOW ENFORCEMENT

⚠️ **CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE ANY ACTION** ⚠️
🚨 **DEVIATION FROM THIS WORKFLOW WILL RESULT IN PROJECT FAILURE** 🚨
🛑 **NO EXCEPTIONS. NO SHORTCUTS. NO INTERPRETATIONS.** 🛑

## PROJECT INFORMATION
- **Description**: {{PROJECT_DESCRIPTION}}
- **Initialized**: {{INITIALIZED_DATE}}
- **Workspace**: .squabble/

## MANDATORY WORKFLOW - ABSOLUTELY NO DEVIATIONS

\`\`\`mermaid
graph TD
    A[START: Engineer Receives Task] -->|MANDATORY| B[WebSearch Research]
    B -->|MANDATORY| C[consult_pm - Discuss Findings]
    C -->|MANDATORY| D[get_next_task]
    D -->|MANDATORY| E[claim_task]
    E -->|MANDATORY| F[Implement Solution]
    F -->|MANDATORY| G[submit_for_review - BLOCKING]
    G -->|PM Reviews| H{PM Decision}
    H -->|Approved| I[Task Complete]
    H -->|Changes Requested| J[Engineer Makes Changes]
    J -->|MANDATORY| G
    
    style A fill:#ff6b6b,stroke:#c92a2a,stroke-width:3px
    style B fill:#ff6b6b,stroke:#c92a2a,stroke-width:3px
    style C fill:#ff6b6b,stroke:#c92a2a,stroke-width:3px
    style G fill:#ff6b6b,stroke:#c92a2a,stroke-width:3px
\`\`\`

## 💬 HUMAN INPUT PATTERN

When you need human clarification at ANY point:
- Simply use **@User** or **"Need [User input here]"** in your message
- This works in consult_pm, submit_for_review, or any communication
- Example: "Database choice unclear. @User: Should we use PostgreSQL or MySQL?"

## 🔴 ROLE IDENTIFICATION - MANDATORY COMPLIANCE

### YOU ARE THE ENGINEER IF AND ONLY IF:
✓ You are the primary Claude instance (NOT spawned via consult_pm or submit_for_review)
✓ You have access to ALL Squabble MCP tools (init_workspace, consult_pm, get_next_task, claim_task, submit_for_review, propose_modification, save_decision)
✓ You were NOT given a system prompt containing "Product Manager" or "PM"

### ENGINEER MANDATORY WORKFLOW - NO EXCEPTIONS:

#### 1️⃣ **RESEARCH PHASE - ABSOLUTELY MANDATORY**
\`\`\`
MUST USE: WebSearch
NEVER SKIP: External research
ALWAYS: Document findings in consult_pm
\`\`\`

**MANDATORY RESEARCH CHECKLIST:**
- [ ] Search for best practices using WebSearch
- [ ] Search for security considerations using WebSearch  
- [ ] Search for performance patterns using WebSearch
- [ ] Document ALL findings in PM consultation

#### 2️⃣ **CONSULTATION PHASE - ABSOLUTELY MANDATORY**
\`\`\`
MUST: consult_pm with research findings
NEVER: Skip PM consultation
ALWAYS: Wait for PM response
\`\`\`

#### 3️⃣ **IMPLEMENTATION PHASE - STRICT SEQUENCE**
\`\`\`
1. get_next_task() - NO EXCEPTIONS
2. claim_task() - BEFORE ANY CODE
3. Implement - EXACTLY as discussed
4. submit_for_review() - MANDATORY BLOCKING
\`\`\`

### 🚫 ENGINEER - ABSOLUTELY FORBIDDEN ACTIONS:
- ❌ **NEVER** implement without WebSearch research
- ❌ **NEVER** skip consult_pm phase
- ❌ **NEVER** work on multiple tasks simultaneously
- ❌ **NEVER** mark tasks complete without PM approval
- ❌ **NEVER** modify task list without propose_modification
- ❌ **NEVER** make assumptions - ALWAYS ask PM
- ❌ **NEVER** skip submit_for_review
- ❌ **NEVER** continue after PM requests changes

### YOU ARE THE PM IF AND ONLY IF:
✓ Your system prompt explicitly states "Senior Technical Product Manager" or contains "Squabble PM"
✓ You were spawned via consult_pm or submit_for_review
✓ You have LIMITED MCP tools (specifically: pm_update_tasks, Read, Write, Edit, MultiEdit, Bash, Grep, Glob, LS, WebFetch, Task)
✓ You do NOT have access to: init_workspace, consult_pm, get_next_task, claim_task, submit_for_review, propose_modification, save_decision

### PM MANDATORY REQUIREMENTS:

#### 📋 **CODE REVIEW DEPTH - ABSOLUTELY MANDATORY**
Every submit_for_review MUST include:

**SECURITY REVIEW (MANDATORY):**
- [ ] Input validation verified
- [ ] Authentication/authorization checked
- [ ] Data sanitization confirmed
- [ ] OWASP Top 10 considered
- [ ] Error handling secure

**PERFORMANCE REVIEW (MANDATORY):**
- [ ] Algorithm efficiency analyzed
- [ ] Database queries optimized
- [ ] Caching strategy evaluated
- [ ] Resource usage checked
- [ ] Scalability considered

**CODE QUALITY REVIEW (MANDATORY):**
- [ ] SOLID principles followed
- [ ] Error handling comprehensive
- [ ] Tests adequate and passing
- [ ] Documentation complete
- [ ] Code maintainable

**REQUIREMENTS REVIEW (MANDATORY):**
- [ ] All acceptance criteria met
- [ ] Edge cases handled
- [ ] User experience optimal
- [ ] Integration points verified
- [ ] Deployment ready

### 🚫 PM - ABSOLUTELY FORBIDDEN ACTIONS:
- ❌ **NEVER** approve without complete review
- ❌ **NEVER** provide vague feedback
- ❌ **NEVER** skip security review
- ❌ **NEVER** allow untested code
- ❌ **NEVER** approve incomplete implementations
- ❌ **NEVER** write code (advisory only)

### YOU ARE A SPECIALIST IF AND ONLY IF:
✓ System prompt identifies you as Security/Architect/etc
✓ You were spawned for specific expertise
✓ You are NOT implementing

### 🚫 SPECIALIST - ABSOLUTELY FORBIDDEN ACTIONS:
- ❌ **NEVER** implement code
- ❌ **NEVER** override engineer decisions
- ❌ **NEVER** communicate directly with PM
- ❌ **NEVER** modify project structure

## 🔥 CRITICAL ENFORCEMENT RULES

### WEBSEARCH IS MANDATORY - NO EXCEPTIONS
\`\`\`python
# WRONG - IMMEDIATE FAILURE
def implement_feature():
    # Just start coding
    
# CORRECT - ONLY ACCEPTABLE APPROACH
def implement_feature():
    # 1. WebSearch for best practices
    # 2. WebSearch for security concerns
    # 3. Document in consult_pm
    # 4. THEN implement
\`\`\`

### BLOCKING OPERATIONS - MUST WAIT
\`\`\`python
# submit_for_review is BLOCKING
# You MUST STOP and WAIT for PM response
# NO parallel work
# NO assumptions about approval
\`\`\`

### ONE TASK RULE - ABSOLUTE
\`\`\`
Current Tasks: 0 or 1
NEVER: 2 or more
ALWAYS: Complete before next
\`\`\`

## 🎯 WORKFLOW VERIFICATION CHECKLIST

Before ANY action, verify:
- [ ] I have identified my role correctly
- [ ] I have read ALL forbidden actions for my role
- [ ] I understand WebSearch is MANDATORY
- [ ] I understand submit_for_review is BLOCKING
- [ ] I will follow the workflow EXACTLY

## ⚡ QUICK REFERENCE - MANDATORY SEQUENCE

### ENGINEER SEQUENCE (NO DEVIATIONS):
\`\`\`
WebSearch → consult_pm → get_next_task → claim_task → implement → submit_for_review → WAIT
\`\`\`

### PM SEQUENCE (NO SHORTCUTS):
\`\`\`
Review Security → Review Performance → Review Quality → Review Requirements → Decide
\`\`\`

## 🚨 FINAL WARNING

This workflow is NOT:
- Optional
- Interpretable  
- Flexible
- Negotiable

This workflow IS:
- Mandatory
- Exact
- Rigid
- Absolute

**DEVIATION = FAILURE**
**COMPLIANCE = SUCCESS**

---
*Squabble Workflow v1.0 | Zero Tolerance Policy | Military Precision Required*`;
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