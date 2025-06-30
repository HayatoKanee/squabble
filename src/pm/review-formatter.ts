import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';

// Types for parsed review data
export interface ReviewSection {
  title: string;
  content: string[];
}

export interface ToolEvent {
  timestamp: string;
  tool: string;
  args: any;
  result?: string;
}

export interface FormattedReview {
  summary: string;
  sections: ReviewSection[];
  toolUsage: ToolEvent[];
  actionItems: string[];
  approval: 'approved' | 'changes-requested' | 'needs-discussion';
  metadata: {
    taskId: string;
    taskTitle: string;
    reviewedAt: Date;
    sessionId: string;
  };
}

export interface ReviewStorage {
  // Raw data for debugging
  raw: {
    jsonStream: string;
    timestamp: Date;
    sessionId: string;
  };
  
  // Parsed & formatted for display
  formatted: FormattedReview;
}

/**
 * Parses JSON stream output from Claude CLI and extracts PM review content
 */
export class ReviewFormatter {
  /**
   * Parse JSON stream and extract review data
   */
  async parseReview(
    jsonStream: string,
    taskId: string,
    taskTitle: string,
    sessionId: string
  ): Promise<ReviewStorage> {
    const lines = jsonStream.split('\n').filter(line => line.trim());
    const assistantMessages: string[] = [];
    const toolEvents: ToolEvent[] = [];
    
    // Parse each JSON event
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        
        switch (event.type) {
          case 'assistant':
            // Extract assistant message content
            if (event.message?.content) {
              for (const content of event.message.content) {
                if (content.type === 'text' && content.text) {
                  assistantMessages.push(content.text);
                }
              }
            }
            break;
            
          case 'tool_use':
            // Record tool usage
            toolEvents.push({
              timestamp: new Date().toISOString(),
              tool: event.tool,
              args: event.args
            });
            break;
            
          case 'tool_result':
            // Add result to last tool event if relevant
            if (toolEvents.length > 0 && event.result) {
              const lastEvent = toolEvents[toolEvents.length - 1];
              if (lastEvent.tool === event.tool) {
                lastEvent.result = this.summarizeToolResult(event.tool, event.result);
              }
            }
            break;
        }
      } catch (e) {
        // Skip non-JSON lines
        continue;
      }
    }
    
    // Combine all assistant messages into review text
    const reviewText = assistantMessages.join('\n\n');
    
    // Parse the review content
    const formatted = this.formatReview(reviewText, taskId, taskTitle, sessionId, toolEvents);
    
    return {
      raw: {
        jsonStream,
        timestamp: new Date(),
        sessionId
      },
      formatted
    };
  }
  
  /**
   * Format review text into structured sections
   */
  private formatReview(
    reviewText: string,
    taskId: string,
    taskTitle: string,
    sessionId: string,
    toolEvents: ToolEvent[]
  ): FormattedReview {
    const sections: ReviewSection[] = [];
    const actionItems: string[] = [];
    
    // Detect approval status
    const approval = this.detectApprovalStatus(reviewText);
    
    // Parse sections using common review format markers
    const sectionRegex = /^(?:#{1,3}|\\*\\*)\s*(.+?)(?:\s*\\*\\*)?$/gm;
    const lines = reviewText.split('\n');
    
    let currentSection: ReviewSection | null = null;
    let inActionItems = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for section headers
      const sectionMatch = line.match(/^(?:#{1,3}|\*\*)\s*(.+?)(?:\s*\*\*)?$/);
      if (sectionMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: sectionMatch[1].trim().replace(/[:]/g, ''),
          content: []
        };
        
        // Check if this is an action items section
        inActionItems = /required changes|action items|must.?fix|changes needed/i.test(currentSection.title);
        continue;
      }
      
      // Extract action items from lists
      if (inActionItems || /required changes|must.?fix/i.test(reviewText.slice(Math.max(0, i - 200), i))) {
        const listMatch = line.match(/^[\-\*•]\s+(.+)$/);
        const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
        
        if (listMatch || numberedMatch) {
          const item = (listMatch?.[1] || numberedMatch?.[1] || '').trim();
          if (item && !actionItems.includes(item)) {
            actionItems.push(item);
          }
        }
      }
      
      // Add content to current section
      if (currentSection && line) {
        currentSection.content.push(line);
      }
    }
    
    // Add final section
    if (currentSection) {
      sections.push(currentSection);
    }
    
    // Extract summary (first paragraph or first section)
    const summary = this.extractSummary(reviewText, sections);
    
    return {
      summary,
      sections,
      toolUsage: toolEvents,
      actionItems,
      approval,
      metadata: {
        taskId,
        taskTitle,
        reviewedAt: new Date(),
        sessionId
      }
    };
  }
  
  /**
   * Detect approval status from review text
   */
  private detectApprovalStatus(reviewText: string): 'approved' | 'changes-requested' | 'needs-discussion' {
    const text = reviewText.toLowerCase();
    
    // Strong approval indicators
    if (
      /approved|lgtm|looks good to me|ready to merge|no changes needed|implementation is approved/.test(text) &&
      !/not approved|needs changes|requires? modification/.test(text)
    ) {
      return 'approved';
    }
    
    // Changes required indicators
    if (
      /needs? changes?|requires? modification|must fix|not approved|requested changes/.test(text) ||
      /required changes:/.test(text)
    ) {
      return 'changes-requested';
    }
    
    // Default to needs discussion for unclear cases
    return 'needs-discussion';
  }
  
  /**
   * Extract summary from review
   */
  private extractSummary(reviewText: string, sections: ReviewSection[]): string {
    // Look for explicit summary section
    const summarySection = sections.find(s => 
      /summary|overview|assessment/i.test(s.title)
    );
    
    if (summarySection && summarySection.content.length > 0) {
      return summarySection.content.join(' ').trim();
    }
    
    // Use first paragraph as summary
    const firstParagraph = reviewText.split('\n\n')[0].trim();
    if (firstParagraph && firstParagraph.length > 20) {
      return firstParagraph;
    }
    
    // Fallback to first 200 characters
    return reviewText.substring(0, 200).trim() + '...';
  }
  
  /**
   * Summarize tool results for display
   */
  private summarizeToolResult(tool: string, result: any): string {
    if (!result) return '';
    
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    
    switch (tool) {
      case 'Grep':
        const matches = resultStr.match(/\d+ matches?/);
        return matches ? matches[0] : 'Search completed';
        
      case 'Read':
        return `Read ${resultStr.split('\n').length} lines`;
        
      case 'Bash':
        if (resultStr.includes('error') || resultStr.includes('Error')) {
          return `Error: ${resultStr.substring(0, 100)}...`;
        }
        return 'Command executed successfully';
        
      default:
        return resultStr.length > 100 ? resultStr.substring(0, 100) + '...' : resultStr;
    }
  }
  
  /**
   * Save review in both raw and formatted forms
   */
  async saveReview(
    review: ReviewStorage,
    workspaceRoot: string
  ): Promise<void> {
    const reviewsDir = path.join(workspaceRoot, 'workspace', 'reviews', review.formatted.metadata.taskId);
    await fs.ensureDir(reviewsDir);
    
    // Save raw JSON stream
    const rawPath = path.join(reviewsDir, 'raw.jsonl');
    await fs.writeFile(rawPath, review.raw.jsonStream);
    
    // Save formatted JSON
    const formattedJsonPath = path.join(reviewsDir, 'formatted.json');
    await fs.writeJson(formattedJsonPath, review.formatted, { spaces: 2 });
    
    // Save human-readable markdown
    const markdownPath = path.join(reviewsDir, 'formatted.md');
    const markdown = this.generateMarkdown(review.formatted);
    await fs.writeFile(markdownPath, markdown);
  }
  
  /**
   * Generate markdown representation of review
   */
  generateMarkdown(review: FormattedReview): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`# Review for ${review.metadata.taskId}: ${review.metadata.taskTitle}`);
    lines.push('');
    
    // Metadata
    const statusEmoji = review.approval === 'approved' ? '✅' : 
                       review.approval === 'changes-requested' ? '❌' : '💭';
    lines.push(`**Status**: ${statusEmoji} ${this.formatApprovalStatus(review.approval)}`);
    lines.push(`**Reviewed**: ${review.metadata.reviewedAt.toLocaleString()}`);
    lines.push(`**Session**: ${review.metadata.sessionId}`);
    lines.push('');
    
    // Summary
    lines.push('## Summary');
    lines.push(review.summary);
    lines.push('');
    
    // Action items (if any)
    if (review.actionItems.length > 0) {
      lines.push('## Action Items');
      review.actionItems.forEach((item, i) => {
        lines.push(`${i + 1}. ${item}`);
      });
      lines.push('');
    }
    
    // Review sections
    review.sections.forEach(section => {
      // Skip if this is the summary section (already shown)
      if (/summary|overview/i.test(section.title)) return;
      
      lines.push(`## ${section.title}`);
      lines.push(section.content.join('\n'));
      lines.push('');
    });
    
    // PM activity summary
    if (review.toolUsage.length > 0) {
      lines.push('## PM Activity Summary');
      lines.push('<details>');
      lines.push('<summary>Click to expand tool usage details</summary>');
      lines.push('');
      
      review.toolUsage.forEach(event => {
        lines.push(`- **${event.tool}**: ${this.formatToolUsage(event)}`);
        if (event.result) {
          lines.push(`  - Result: ${event.result}`);
        }
      });
      
      lines.push('</details>');
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Format approval status for display
   */
  private formatApprovalStatus(status: string): string {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'changes-requested':
        return 'Changes Requested';
      case 'needs-discussion':
        return 'Needs Discussion';
      default:
        return status;
    }
  }
  
  /**
   * Format tool usage for display
   */
  private formatToolUsage(event: ToolEvent): string {
    switch (event.tool) {
      case 'Read':
        return `Read ${event.args?.file_path || 'file'}`;
      case 'Bash':
        return event.args?.command || 'command';
      case 'Grep':
        return `Search for "${event.args?.pattern || 'pattern'}"`;
      case 'Write':
        return `Write to ${event.args?.file_path || 'file'}`;
      default:
        const argsStr = event.args ? JSON.stringify(event.args) : '{}';
        return argsStr.length > 100 ? argsStr.substring(0, 100) + '...' : argsStr;
    }
  }
}