/**
 * Task Tracker Service Types
 *
 * Type definitions for the task management system that provides
 * todo list and project management capabilities for ClawDock agents.
 */

// ============================================================================
// Task Status and Options Types
// ============================================================================

/**
 * Valid task statuses matching the database enum
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Options for listing tasks with filters
 */
export interface ListTasksOptions {
  /** Filter by task status */
  status?: TaskStatus;
  /** Maximum number of tasks to return */
  limit?: number;
  /** Number of tasks to skip (for pagination) */
  offset?: number;
}

/**
 * Fields that can be updated on a task
 */
export interface UpdateTaskFields {
  /** Task title */
  title?: string;
  /** Task description */
  description?: string | null;
  /** Task status */
  status?: TaskStatus;
  /** Priority (0-100, higher is more urgent) */
  priority?: number;
  /** Source of the task (e.g., "user", "agent", "system") */
  source?: string | null;
  /** Due date for the task */
  dueAt?: Date | null;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes specific to task operations
 */
export type TaskErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CYCLE_DETECTED'
  | 'SELF_DEPENDENCY'
  | 'DEPENDENCY_EXISTS'
  | 'DB_ERROR';

/**
 * Custom error class for task operations
 * Provides structured error information for better handling
 */
export class TaskError extends Error {
  constructor(
    message: string,
    public code: TaskErrorCode,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TaskError';
  }
}
