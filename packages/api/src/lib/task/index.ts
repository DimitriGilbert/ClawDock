/**
 * Task Tracker Module
 *
 * Exports task service functions and types for the ClawDock task management system.
 */

// Re-export service functions
export {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  deleteTask,
  completeTask,
  addDependency,
  removeDependency,
  getNextTask,
} from "./service";

// Re-export types
export {
  TaskError,
  type TaskErrorCode,
  type TaskStatus,
  type ListTasksOptions,
  type UpdateTaskFields,
} from "./types";
