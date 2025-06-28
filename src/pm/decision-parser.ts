import { PMDecision, TaskModification, SpecialistRole } from '../types.js';

export class DecisionParser {
  parsePMResponse(response: string): PMDecision {
    const decision: PMDecision = {
      needsSpecialists: false,
      requiredSpecialists: [],
      taskModifications: [],
      userResponse: response // Default to full response
    };

    // Parse DECISION block
    const decisionMatch = response.match(/\[DECISION\]([\s\S]*?)\[\/DECISION\]/);
    if (decisionMatch) {
      const decisionBlock = decisionMatch[1];
      
      // Parse needsSpecialists
      const needsSpecMatch = decisionBlock.match(/needsSpecialists:\s*(true|false)/);
      if (needsSpecMatch) {
        decision.needsSpecialists = needsSpecMatch[1] === 'true';
      }

      // Parse specialists
      const specialistsMatch = decisionBlock.match(/specialists:\s*([^\n]+)/);
      if (specialistsMatch) {
        const specialists = specialistsMatch[1]
          .split(',')
          .map(s => s.trim())
          .filter(s => ['engineer', 'security', 'architect'].includes(s)) as SpecialistRole[];
        decision.requiredSpecialists = specialists;
      }

      // Parse topic
      const topicMatch = decisionBlock.match(/topic:\s*"([^"]+)"/);
      if (topicMatch) {
        decision.debateTopic = topicMatch[1];
      }

      // Remove decision block from user response
      decision.userResponse = response.replace(decisionMatch[0], '').trim();
    }

    // Parse TASK_MODIFY block
    const taskModifyMatch = response.match(/\[TASK_MODIFY\]([\s\S]*?)\[\/TASK_MODIFY\]/);
    if (taskModifyMatch) {
      const modifications = this.parseTaskModifications(taskModifyMatch[1]);
      decision.taskModifications = modifications;

      // Remove task modify block from user response
      decision.userResponse = decision.userResponse?.replace(taskModifyMatch[0], '').trim();
    }

    return decision;
  }

  private parseTaskModifications(block: string): TaskModification[] {
    const modifications: TaskModification[] = [];
    const lines = block.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse ADD command
      if (trimmed.startsWith('ADD')) {
        const match = trimmed.match(/ADD\s+"([^"]+)"\s+PRIORITY\s+(low|medium|high|critical)/);
        if (match) {
          modifications.push({
            type: 'ADD',
            reason: 'PM directive',
            details: {
              title: match[1],
              priority: match[2]
            },
            proposedBy: 'pm'
          });
        }
      }

      // Parse DELETE command
      else if (trimmed.startsWith('DELETE')) {
        const match = trimmed.match(/DELETE\s+(\S+)\s+"([^"]+)"/);
        if (match) {
          modifications.push({
            type: 'DELETE',
            taskId: match[1],
            reason: match[2],
            details: {},
            proposedBy: 'pm'
          });
        }
      }

      // Parse MODIFY command
      else if (trimmed.startsWith('MODIFY')) {
        const match = trimmed.match(/MODIFY\s+(\S+)\s+"([^"]+)"/);
        if (match) {
          modifications.push({
            type: 'MODIFY',
            taskId: match[1],
            reason: 'PM directive',
            details: {
              newDescription: match[2]
            },
            proposedBy: 'pm'
          });
        }
      }

      // Parse BLOCK command
      else if (trimmed.startsWith('BLOCK')) {
        const match = trimmed.match(/BLOCK\s+(\S+)\s+UNTIL\s+(\S+)/);
        if (match) {
          modifications.push({
            type: 'BLOCK',
            taskId: match[1],
            reason: `Blocked until ${match[2]} is complete`,
            details: {
              blockedBy: match[2]
            },
            proposedBy: 'pm'
          });
        }
      }

      // Parse SPLIT command
      else if (trimmed.startsWith('SPLIT')) {
        const match = trimmed.match(/SPLIT\s+(\S+)\s+INTO\s+(.+)/);
        if (match) {
          const subtasks = match[2].split(',').map(s => s.trim().replace(/"/g, ''));
          modifications.push({
            type: 'SPLIT',
            taskId: match[1],
            reason: 'Task too complex',
            details: {
              subtasks
            },
            proposedBy: 'pm'
          });
        }
      }
    }

    return modifications;
  }

  parseSpecialistResponse(response: string, role: string): {
    content: string;
    recommendations: string[];
    concerns: string[];
  } {
    // TODO: Implement specialist response parsing
    return {
      content: response,
      recommendations: [],
      concerns: []
    };
  }
}