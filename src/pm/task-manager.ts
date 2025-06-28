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
    const newTask: Task = {
      id: `task-${uuid().substring(0, 8)}`,
      title: mod.details.title,
      description: mod.details.description,
      status: 'pending',
      priority: mod.details.priority || 'medium',
      dependencies: mod.details.dependencies || [],
      createdBy: mod.proposedBy,
      modificationHistory: [mod]
    };

    return [...tasks, newTask];
  }

  private async deleteTask(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    if (!mod.taskId) return tasks;

    return tasks.filter(task => {
      if (task.id === mod.taskId) {
        // Log deletion in remaining tasks that depended on this
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
          status: 'blocked',
          blockedBy: mod.details.blockedBy,
          modificationHistory: [...task.modificationHistory, mod]
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
      id: `${mod.taskId}-${index + 1}`,
      title,
      status: 'pending',
      priority: originalTask.priority,
      dependencies: index === 0 ? originalTask.dependencies : [`${mod.taskId}-${index}`],
      createdBy: mod.proposedBy,
      modificationHistory: [{
        ...mod,
        reason: `Split from ${originalTask.title}`
      }]
    }));

    return [...filteredTasks, ...subtasks];
  }

  private async mergeTasks(tasks: Task[], mod: TaskModification): Promise<Task[]> {
    // TODO: Implement merge logic
    return tasks;
  }

  async getNextTasks(count: number = 3): Promise<Task[]> {
    const tasks = await this.getTasks();
    
    // Get unblocked, pending tasks sorted by priority
    const availableTasks = tasks
      .filter(t => t.status === 'pending' && !t.blockedBy)
      .filter(t => t.dependencies.every(dep => 
        tasks.find(dt => dt.id === dep)?.status === 'completed'
      ))
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    return availableTasks.slice(0, count);
  }
}