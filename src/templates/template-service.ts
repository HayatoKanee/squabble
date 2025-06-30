import * as fs from 'fs';
import * as path from 'path';

// Template types
export type TemplateType = 'implementation-plan' | 'implementation-report' | 'review';

// Template context interface
export interface TemplateContext {
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  approach?: string;
  steps?: string[];
  risks?: string[];
  summary?: string;
  filesChanged?: string[];
  testsAdded?: boolean;
  concerns?: string[];
  questions?: string[];
  reviewNotes?: string;
  decision?: string;
  requestedChanges?: string[];
}

// Default templates
const DEFAULT_TEMPLATES = {
  'implementation-plan': `# Implementation Plan for {{taskTitle}}

**Task ID**: {{taskId}}

## Approach
{{approach}}

## Implementation Steps
{{steps}}

## Potential Risks
{{risks}}

---
*Please review this plan before I proceed with implementation.*`,

  'implementation-report': `# Implementation Report for {{taskTitle}}

**Task ID**: {{taskId}}

## Summary
{{summary}}

## Files Changed
{{filesChanged}}

## Tests Added
{{testsAdded}}

## Concerns
{{concerns}}

## Questions for Review
{{questions}}

---
*Please review the implementation and provide feedback.*`,

  'review': `# PM Review for {{taskTitle}}

**Task ID**: {{taskId}}

## Review Notes
{{reviewNotes}}

## Decision
{{decision}}

## Requested Changes
{{requestedChanges}}

---
*Review completed at {{timestamp}}*`
};

export class TemplateService {
  private templateDir: string;

  constructor(workspaceDir: string) {
    this.templateDir = path.join(workspaceDir, 'templates');
  }

  /**
   * Get template content by type
   */
  public getTemplate(type: TemplateType): string {
    const templatePath = this.getTemplatePath(type);
    
    // If custom template exists, use it; otherwise use default
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, 'utf-8');
    }
    
    return DEFAULT_TEMPLATES[type];
  }

  /**
   * Fill template with context values
   */
  public fillTemplate(template: string, context: TemplateContext): string {
    let filled = template;

    // Replace all placeholders
    Object.entries(context).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      let replacement = '';

      if (value === undefined || value === null) {
        replacement = '';
      } else if (Array.isArray(value)) {
        // Format arrays as bullet points
        replacement = value.length > 0 
          ? value.map(item => `- ${item}`).join('\n')
          : '- None';
      } else if (typeof value === 'boolean') {
        replacement = value ? 'Yes' : 'No';
      } else {
        replacement = String(value);
      }

      // Replace all occurrences
      filled = filled.replace(new RegExp(placeholder, 'g'), replacement);
    });

    // Add timestamp if placeholder exists
    filled = filled.replace(/{{timestamp}}/g, new Date().toISOString());

    // Clean up any remaining placeholders
    filled = filled.replace(/{{[^}]+}}/g, '');

    return filled;
  }

  /**
   * Ensure templates directory exists and has default templates
   */
  public async ensureTemplatesExist(): Promise<void> {
    // Create templates directory if it doesn't exist
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
    }

    // Copy default templates if they don't exist
    for (const [type, content] of Object.entries(DEFAULT_TEMPLATES)) {
      const templatePath = this.getTemplatePath(type as TemplateType);
      if (!fs.existsSync(templatePath)) {
        fs.writeFileSync(templatePath, content, 'utf-8');
      }
    }
  }

  /**
   * Get path to template file
   */
  public getTemplatePath(type: TemplateType): string {
    return path.join(this.templateDir, `${type}.md`);
  }

  /**
   * Check if custom template exists
   */
  public hasCustomTemplate(type: TemplateType): boolean {
    return fs.existsSync(this.getTemplatePath(type));
  }

  /**
   * Update custom template
   */
  public updateTemplate(type: TemplateType, content: string): void {
    const templatePath = this.getTemplatePath(type);
    fs.writeFileSync(templatePath, content, 'utf-8');
  }

  /**
   * Reset template to default
   */
  public resetTemplate(type: TemplateType): void {
    const templatePath = this.getTemplatePath(type);
    fs.writeFileSync(templatePath, DEFAULT_TEMPLATES[type], 'utf-8');
  }

  /**
   * Get all available templates
   */
  public getAvailableTemplates(): TemplateType[] {
    return Object.keys(DEFAULT_TEMPLATES) as TemplateType[];
  }
}