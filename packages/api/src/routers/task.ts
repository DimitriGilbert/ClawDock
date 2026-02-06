/**
 * Task Router - tRPC router for task tracker operations
 *
 * Provides comprehensive task management:
 * - List, get, create, update, and delete tasks
 * - Task completion with timestamps
 * - Dependency management with cycle detection
 * - Intelligent task prioritization (getNext)
 *
 * @module routers/task
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../index";
import type { Task, TaskDependency } from "@ClawDock/db";
import { TaskError } from "../lib/task/types";
import type { TaskStatus } from "../lib/task/types";
import {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  deleteTask,
  completeTask,
  addDependency,
  removeDependency,
  getNextTask,
} from "../lib/task/service";

// ============================================================================
// Helper: Convert TaskError to TRPCError
// ============================================================================

/**
 * Maps TaskError codes to TRPCError codes
 */
function mapTaskErrorToTRPC(error: TaskError): TRPCError {
  const codeMap: Record<string, TRPCError["code"]> = {
    NOT_FOUND: "NOT_FOUND",
    VALIDATION_ERROR: "BAD_REQUEST",
    CYCLE_DETECTED: "BAD_REQUEST",
    SELF_DEPENDENCY: "BAD_REQUEST",
    DEPENDENCY_EXISTS: "BAD_REQUEST",
    DB_ERROR: "INTERNAL_SERVER_ERROR",
  };

  return new TRPCError({
    code: codeMap[error.code] ?? "INTERNAL_SERVER_ERROR",
    message: error.message,
    cause: error,
  });
}

// ============================================================================
// Schemas
// ============================================================================

const TaskIdSchema = z.object({
  id: z.string().uuid(),
});

const TaskStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);

const ListTasksSchema = z.object({
  status: TaskStatusSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.number().min(0).max(100).optional().default(50),
  source: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: z.number().min(0).max(100).optional(),
  source: z.string().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const DependencySchema = z.object({
  taskId: z.string().uuid(),
  dependsOnId: z.string().uuid(),
});

// ============================================================================
// Router
// ============================================================================

export const taskRouter = router({
  /**
   * List tasks with optional filters
   *
   * Returns tasks sorted by priority (highest first), then by creation date (oldest first).
   * Supports filtering by status and pagination.
   *
   * @param input.status - Optional status filter
   * @param input.limit - Maximum number of tasks to return (default: 50)
   * @param input.offset - Number of tasks to skip (default: 0)
   */
  list: publicProcedure
    .input(ListTasksSchema)
    .query(async ({ input }): Promise<Task[]> => {
      try {
        return await listTasks({
          status: input.status as TaskStatus | undefined,
          limit: input.limit,
          offset: input.offset,
        });
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list tasks",
        });
      }
    }),

  /**
   * Get a specific task by ID
   *
   * @param input.id - The UUID of the task to retrieve
   * @returns The task or throws NOT_FOUND if not found
   */
  get: publicProcedure
    .input(TaskIdSchema)
    .query(async ({ input }): Promise<Task> => {
      try {
        const task = await getTaskById(input.id);

        if (!task) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Task with ID '${input.id}' not found`,
          });
        }

        return task;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get task",
        });
      }
    }),

  /**
   * Create a new task
   *
   * @param input.title - The task title (required)
   * @param input.description - Optional task description
   * @param input.priority - Priority level 0-100 (default: 50, higher is more urgent)
   * @param input.source - Source of the task (e.g., "user", "agent", "system")
   * @returns The created task
   */
  create: publicProcedure
    .input(CreateTaskSchema)
    .mutation(async ({ input }): Promise<Task> => {
      try {
        return await createTask(
          input.title,
          input.description,
          input.priority,
          input.source
        );
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create task",
        });
      }
    }),

  /**
   * Update an existing task
   *
   * @param input.id - The UUID of the task to update
   * @param input.title - New title (optional)
   * @param input.description - New description (optional)
   * @param input.status - New status (optional)
   * @param input.priority - New priority (optional)
   * @param input.source - New source (optional)
   * @param input.dueAt - New due date (optional)
   * @param input.metadata - New metadata (optional)
   * @returns The updated task
   */
  update: publicProcedure
    .input(UpdateTaskSchema)
    .mutation(async ({ input }): Promise<Task> => {
      try {
        const { id, ...updates } = input;
        return await updateTask(id, {
          title: updates.title,
          description: updates.description,
          status: updates.status as TaskStatus | undefined,
          priority: updates.priority,
          source: updates.source,
          dueAt: updates.dueAt,
          metadata: updates.metadata,
        });
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to update task",
        });
      }
    }),

  /**
   * Delete a task
   *
   * Permanently removes a task and its dependencies.
   *
   * @param input.id - The UUID of the task to delete
   * @returns Success indicator
   */
  delete: publicProcedure
    .input(TaskIdSchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      try {
        await deleteTask(input.id);

        return { success: true };
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete task",
        });
      }
    }),

  /**
   * Get the next task to work on
   *
   * Returns the highest priority pending task that has no incomplete dependencies.
   * A task is only eligible if ALL its dependencies are completed.
   *
   * @returns The next task to work on, or null if no eligible tasks
   */
  getNext: publicProcedure.query(async (): Promise<Task | null> => {
    try {
      return await getNextTask();
    } catch (error) {
      if (error instanceof TaskError) {
        throw mapTaskErrorToTRPC(error);
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to get next task",
      });
    }
  }),

  /**
   * Add a dependency between two tasks
   *
   * The task with taskId will depend on the task with dependsOnId,
   * meaning the dependent task cannot start until the dependency is completed.
   *
   * @param input.taskId - The task that depends on another
   * @param input.dependsOnId - The task being depended upon
   * @returns The created dependency
   */
  addDependency: publicProcedure
    .input(DependencySchema)
    .mutation(async ({ input }): Promise<TaskDependency> => {
      try {
        return await addDependency(input.taskId, input.dependsOnId);
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to add dependency",
        });
      }
    }),

  /**
   * Remove a dependency between two tasks
   *
   * @param input.taskId - The task that depends on another
   * @param input.dependsOnId - The task being depended upon
   * @returns Success indicator
   */
  removeDependency: publicProcedure
    .input(DependencySchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      try {
        await removeDependency(input.taskId, input.dependsOnId);

        return { success: true };
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to remove dependency",
        });
      }
    }),

  /**
   * Mark a task as completed
   *
   * Sets the task status to "completed" and records the completion timestamp.
   *
   * @param input.id - The UUID of the task to complete
   * @returns The completed task
   */
  complete: publicProcedure
    .input(TaskIdSchema)
    .mutation(async ({ input }): Promise<Task> => {
      try {
        return await completeTask(input.id);
      } catch (error) {
        if (error instanceof TaskError) {
          throw mapTaskErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to complete task",
        });
      }
    }),
});

export type TaskRouter = typeof taskRouter;
