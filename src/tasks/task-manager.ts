import { v4 as uuid } from 'uuid';
import { WorkspaceManager } from '../workspace/manager.js';
import { Task, TaskModification } from '../types.js';

export class TaskManager {
  constructor(private workspaceManager: WorkspaceManager) {}

  async getTasks(): Promise<Task[]> {
    return await this.workspaceManager.getTasks();
  }

  async applyModifications(modifications: TaskModification[]): Promise<void> {
    let tasks = await this.getTasks();

    for (const mod of modifications) {
      switch (mod.type) {
        case 'ADD':
          tasks = await this.addTask(tasks, mod);
          break;
        
        case 'DELETE':
          tasks = await this.deleteTask(tasks, mod);
          break;
        
        case 'MODIFY':
          tasks = await this.modifyTask(tasks, mod);
          break;
        
        case 'BLOCK':
          tasks = await this.blockTask(tasks, mod);
          break;
        
        case 'SPLIT':
          tasks = await this.splitTask(tasks, mod);
          break;
        
        case 'MERGE':
          tasks = await this.mergeTasks(tasks, mod);
          break;
      }
    }

    await this.workspaceManager.saveTasks(tasks);
  }

  private async addTask(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    // Get the next sequential ID
    const nextId = await this.getNextTaskId();
    
    const newTask: Task = {
      id: nextId,
      title: mod.details.title,
      description: mod.details.description,
      status: 'pending',
      priority: mod.details.priority || 'medium',
      dependencies: mod.details.dependencies || [],
      requiresPlan: mod.details.requiresPlan !== undefined 
        ? mod.details.requiresPlan 
        : this.shouldRequirePlan(mod.details.priority),  // Default based on priority
      modificationHistory: [{
        ...mod,
        timestamp: new Date()
      }]
    };

    return [...tasks, newTask];
  }

  private shouldRequirePlan(priority?: string): boolean {
    // Simple heuristic for MVP: high and critical priority tasks require plans by default
    return priority === 'high' || priority === 'critical';
  }

  private async getNextTaskId(): Promise<string> {
    // Get current counter from workspace context
    let counter = await this.workspaceManager.getContext('task-counter');
    if (!counter || typeof counter !== 'number') {
      counter = 0;
    }
    
    // Increment counter
    counter++;
    
    // Save updated counter
    await this.workspaceManager.saveContext('task-counter', counter);
    
    // Return formatted ID (e.g., SQBL-1, SQBL-2, etc.)
    return `SQBL-${counter}`;
  }

  private async deleteTask(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    if (!mod.taskId) return tasks;

    return tasks.filter(task => {
      if (task.id === mod.taskId) {
        // Update tasks that depended on this one
        tasks.forEach(t => {
          if (t.dependencies.includes(mod.taskId!)) {
            t.modificationHistory.push({
              ...mod,
              reason: `Dependency ${mod.taskId} was deleted`
            });
            t.dependencies = t.dependencies.filter(d => d !== mod.taskId!);
          }
        });
        return false;
      }
      return true;
    });
  }

  private async modifyTask(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    if (!mod.taskId) return tasks;

    return tasks.map(task => {
      if (task.id === mod.taskId) {
        return {
          ...task,
          description: mod.details.newDescription || task.description,
          title: mod.details.newTitle || task.title,
          priority: mod.details.newPriority || task.priority,
          status: mod.details.status || task.status,
          requiresPlan: mod.details.requiresPlan !== undefined 
            ? mod.details.requiresPlan 
            : task.requiresPlan,
          modificationHistory: [...task.modificationHistory, mod]
        };
      }
      return task;
    });
  }

  private async blockTask(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    if (!mod.taskId) return tasks;

    return tasks.map(task => {
      if (task.id === mod.taskId) {
        return {
          ...task,
          blockedBy: mod.details.blockedBy,
          modificationHistory: [...task.modificationHistory, {
            ...mod,
            timestamp: new Date()
          }]
        };
      }
      return task;
    });
  }

  private async splitTask(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    if (!mod.taskId) return tasks;

    const originalTask = tasks.find(t => t.id === mod.taskId);
    if (!originalTask) return tasks;

    // Remove original task
    const filteredTasks = tasks.filter(t => t.id !== mod.taskId);

    // Add subtasks
    const subtasks: Task[] = mod.details.subtasks.map((title: string, index: number) => ({
      id: `${mod.taskId}.${index + 1}`,  // Use dot notation for subtasks (e.g., SQBL-1.1, SQBL-1.2)
      title,
      status: 'pending',
      priority: originalTask.priority,
      dependencies: index === 0 ? originalTask.dependencies : [`${mod.taskId}-${index}`],
      modificationHistory: [{
        ...mod,
        reason: `Split from ${originalTask.title}`
      }]
    }));

    return [...filteredTasks, ...subtasks];
  }

  private async mergeTasks(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    // Implementation for merging multiple tasks
    // For now, return tasks unchanged
    return tasks;
  }

  async getNextTasks(count: number = 3): Promise<Task[]> {
    const tasks = await this.getTasks();
    
    // Get unblocked, pending tasks sorted by priority
    const availableTasks = tasks
      .filter(t => t.status === 'pending' && !t.blockedBy)
      .filter(t => t.dependencies.every(dep => 
        tasks.find(dt => dt.id === dep)?.status === 'done'
      ))
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    return availableTasks.slice(0, count);
  }
}