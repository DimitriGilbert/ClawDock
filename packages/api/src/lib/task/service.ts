/**
 * Task Tracker Service
 *
 * Core service for managing tasks in ClawDock's agent task management system.
 * Provides CRUD operations, dependency management with cycle detection,
 * and intelligent task prioritization.
 */

import {
  db,
  tasks,
  taskDependencies,
  eq,
  and,
  desc,
  asc,
  type Task,
  type NewTask,
  type TaskDependency,
} from "@ClawDock/db";
import { TaskError } from "./types";
import type { ListTasksOptions, UpdateTaskFields } from "./types";

// ============================================================================
// Task CRUD Operations
// ============================================================================

/**
 * Creates a new task
 *
 * @param title - The task title (required)
 * @param description - Optional task description
 * @param priority - Priority level 0-100 (default: 50, higher is more urgent)
 * @param source - Source of the task (e.g., "user", "agent", "system")
 * @returns The created task
 * @throws TaskError if creation fails
 */
export async function createTask(
  title: string,
  description?: string,
  priority?: number,
  source?: string
): Promise<Task> {
  try {
    if (!title || title.trim().length === 0) {
      throw new TaskError(
        "Task title is required and cannot be empty",
        "VALIDATION_ERROR",
        { title }
      );
    }

    const now = new Date();
    const newTask: NewTask = {
      title: title.trim(),
      description: description ?? null,
      priority: priority ?? 50,
      source: source ?? null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    const [created] = await db.insert(tasks).values(newTask).returning();

    if (!created) {
      throw new TaskError(
        "Failed to create task - no task returned",
        "DB_ERROR",
        { title }
      );
    }

    return created;
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to create task: ${errorMessage}`,
      "DB_ERROR",
      { title, error: errorMessage }
    );
  }
}

/**
 * Gets a task by its ID
 *
 * @param id - The task UUID
 * @returns The task or null if not found
 * @throws TaskError if database operation fails
 */
export async function getTaskById(id: string): Promise<Task | null> {
  try {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    return task ?? null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to get task: ${errorMessage}`,
      "DB_ERROR",
      { id, error: errorMessage }
    );
  }
}

/**
 * Lists tasks with optional filters
 *
 * @param options - Filter and pagination options
 * @returns Array of tasks
 * @throws TaskError if database operation fails
 */
export async function listTasks(options: ListTasksOptions = {}): Promise<Task[]> {
  try {
    const { status, limit = 50, offset = 0 } = options;

    // Build the query using the fluent API
    let query = db.select().from(tasks);

    if (status) {
      query = query.where(eq(tasks.status, status)) as typeof query;
    }

    const result = await query
      .orderBy(desc(tasks.priority), asc(tasks.createdAt))
      .limit(limit)
      .offset(offset);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to list tasks: ${errorMessage}`,
      "DB_ERROR",
      { options, error: errorMessage }
    );
  }
}

/**
 * Updates a task's fields
 *
 * @param id - The task UUID
 * @param updates - Partial task fields to update
 * @returns The updated task
 * @throws TaskError if task not found or update fails
 */
export async function updateTask(
  id: string,
  updates: UpdateTaskFields
): Promise<Task> {
  try {
    // Check if task exists
    const existing = await getTaskById(id);
    if (!existing) {
      throw new TaskError(
        `Task with ID '${id}' not found`,
        "NOT_FOUND",
        { id }
      );
    }

    // Build update object with only provided fields
    const updateValues: Partial<NewTask> = {
      updatedAt: new Date(),
    };

    if (updates.title !== undefined) {
      if (!updates.title || updates.title.trim().length === 0) {
        throw new TaskError(
          "Task title cannot be empty",
          "VALIDATION_ERROR",
          { id, title: updates.title }
        );
      }
      updateValues.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
      updateValues.description = updates.description;
    }

    if (updates.status !== undefined) {
      updateValues.status = updates.status;
    }

    if (updates.priority !== undefined) {
      if (updates.priority < 0 || updates.priority > 100) {
        throw new TaskError(
          "Priority must be between 0 and 100",
          "VALIDATION_ERROR",
          { id, priority: updates.priority }
        );
      }
      updateValues.priority = updates.priority;
    }

    if (updates.source !== undefined) {
      updateValues.source = updates.source;
    }

    if (updates.dueAt !== undefined) {
      updateValues.dueAt = updates.dueAt;
    }

    if (updates.metadata !== undefined) {
      updateValues.metadata = updates.metadata;
    }

    const [updated] = await db
      .update(tasks)
      .set(updateValues)
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) {
      throw new TaskError(
        `Failed to update task - task not found after update`,
        "NOT_FOUND",
        { id }
      );
    }

    return updated;
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to update task: ${errorMessage}`,
      "DB_ERROR",
      { id, updates, error: errorMessage }
    );
  }
}

/**
 * Deletes a task and its dependencies
 *
 * @param id - The task UUID
 * @throws TaskError if task not found or deletion fails
 */
export async function deleteTask(id: string): Promise<void> {
  try {
    // Check if task exists
    const existing = await getTaskById(id);
    if (!existing) {
      throw new TaskError(
        `Task with ID '${id}' not found`,
        "NOT_FOUND",
        { id }
      );
    }

    // Delete the task (cascades to dependencies due to foreign key constraints)
    await db.delete(tasks).where(eq(tasks.id, id));
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to delete task: ${errorMessage}`,
      "DB_ERROR",
      { id, error: errorMessage }
    );
  }
}

// ============================================================================
// Task Completion
// ============================================================================

/**
 * Marks a task as completed with timestamp
 *
 * @param id - The task UUID
 * @returns The completed task
 * @throws TaskError if task not found or completion fails
 */
export async function completeTask(id: string): Promise<Task> {
  try {
    const existing = await getTaskById(id);
    if (!existing) {
      throw new TaskError(
        `Task with ID '${id}' not found`,
        "NOT_FOUND",
        { id }
      );
    }

    const now = new Date();
    const [updated] = await db
      .update(tasks)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) {
      throw new TaskError(
        `Failed to complete task - task not found after update`,
        "NOT_FOUND",
        { id }
      );
    }

    return updated;
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to complete task: ${errorMessage}`,
      "DB_ERROR",
      { id, error: errorMessage }
    );
  }
}

// ============================================================================
// Dependency Management
// ============================================================================

/**
 * Gets all dependencies for a task (what this task depends on)
 *
 * @param taskId - The task UUID
 * @returns Array of task IDs that this task depends on
 */
async function getTaskDependencies(taskId: string): Promise<string[]> {
  const deps = await db
    .select({ dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, taskId));

  return deps.map((d) => d.dependsOnId);
}

/**
 * Checks if adding a dependency would create a cycle
 *
 * Uses BFS to traverse the dependency graph and check if the target task
 * transitively depends on the source task.
 *
 * @param taskId - The task that would depend on dependsOnId
 * @param dependsOnId - The task being depended upon
 * @returns true if adding this dependency would create a cycle
 */
async function wouldCreateCycle(
  taskId: string,
  dependsOnId: string
): Promise<boolean> {
  // If we can reach taskId starting from dependsOnId, adding this dependency creates a cycle
  const visited = new Set<string>();
  const queue: string[] = [dependsOnId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (current === taskId) {
      // We reached the source task, which means dependsOnId (transitively) depends on taskId
      // Adding taskId -> dependsOnId would create a cycle
      return true;
    }

    if (visited.has(current)) continue;
    visited.add(current);

    // Get all tasks that 'current' depends on
    const dependencies = await getTaskDependencies(current);
    for (const depId of dependencies) {
      if (!visited.has(depId)) {
        queue.push(depId);
      }
    }
  }

  return false;
}

/**
 * Adds a dependency between two tasks
 *
 * The task with taskId will depend on the task with dependsOnId,
 * meaning the dependent task cannot be completed until the dependency is completed.
 *
 * @param taskId - The task that depends on another
 * @param dependsOnId - The task being depended upon
 * @returns The created dependency
 * @throws TaskError if tasks not found, self-dependency, cycle detected, or dependency already exists
 */
export async function addDependency(
  taskId: string,
  dependsOnId: string
): Promise<TaskDependency> {
  try {
    // Check for self-dependency
    if (taskId === dependsOnId) {
      throw new TaskError(
        "A task cannot depend on itself",
        "SELF_DEPENDENCY",
        { taskId, dependsOnId }
      );
    }

    // Verify both tasks exist
    const [task, dependsOn] = await Promise.all([
      getTaskById(taskId),
      getTaskById(dependsOnId),
    ]);

    if (!task) {
      throw new TaskError(
        `Task with ID '${taskId}' not found`,
        "NOT_FOUND",
        { taskId }
      );
    }

    if (!dependsOn) {
      throw new TaskError(
        `Dependency task with ID '${dependsOnId}' not found`,
        "NOT_FOUND",
        { dependsOnId }
      );
    }

    // Check if dependency already exists
    const existingDep = await db
      .select()
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependsOnId, dependsOnId)
        )
      )
      .limit(1);

    if (existingDep.length > 0) {
      throw new TaskError(
        "This dependency already exists",
        "DEPENDENCY_EXISTS",
        { taskId, dependsOnId }
      );
    }

    // Check for cycles
    const createsCycle = await wouldCreateCycle(taskId, dependsOnId);
    if (createsCycle) {
      throw new TaskError(
        "Adding this dependency would create a circular dependency",
        "CYCLE_DETECTED",
        { taskId, dependsOnId }
      );
    }

    // Create the dependency
    const [created] = await db
      .insert(taskDependencies)
      .values({ taskId, dependsOnId })
      .returning();

    if (!created) {
      throw new TaskError(
        "Failed to create dependency - no dependency returned",
        "DB_ERROR",
        { taskId, dependsOnId }
      );
    }

    return created;
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to add dependency: ${errorMessage}`,
      "DB_ERROR",
      { taskId, dependsOnId, error: errorMessage }
    );
  }
}

/**
 * Removes a dependency between two tasks
 *
 * @param taskId - The task that depends on another
 * @param dependsOnId - The task being depended upon
 * @throws TaskError if dependency not found or removal fails
 */
export async function removeDependency(
  taskId: string,
  dependsOnId: string
): Promise<void> {
  try {
    const result = await db
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.dependsOnId, dependsOnId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new TaskError(
        "Dependency not found",
        "NOT_FOUND",
        { taskId, dependsOnId }
      );
    }
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to remove dependency: ${errorMessage}`,
      "DB_ERROR",
      { taskId, dependsOnId, error: errorMessage }
    );
  }
}

// ============================================================================
// Task Prioritization
// ============================================================================

/**
 * Gets the next task to work on
 *
 * Returns the highest priority pending task that has no incomplete dependencies.
 * A task is only eligible if ALL its dependencies are completed.
 *
 * @returns The next task to work on, or null if no eligible tasks
 * @throws TaskError if database operation fails
 */
export async function getNextTask(): Promise<Task | null> {
  try {
    // Get all pending tasks sorted by priority (highest first), then by creation date (oldest first)
    const pendingTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "pending"))
      .orderBy(desc(tasks.priority), asc(tasks.createdAt));

    // For each pending task, check if all its dependencies are completed
    for (const task of pendingTasks) {
      const dependencies = await getTaskDependencies(task.id);

      if (dependencies.length === 0) {
        // No dependencies, this task is eligible
        return task;
      }

      // Check each dependency to see if it's completed
      let allDepsCompleted = true;
      for (const depId of dependencies) {
        const depTask = await getTaskById(depId);
        if (!depTask || depTask.status !== "completed") {
          allDepsCompleted = false;
          break;
        }
      }

      if (allDepsCompleted) {
        return task;
      }
    }

    // No eligible tasks found
    return null;
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new TaskError(
      `Failed to get next task: ${errorMessage}`,
      "DB_ERROR",
      { error: errorMessage }
    );
  }
}
