import { env } from "@ClawDock/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });

// Re-export schema namespace
export { schema };

// Re-export drizzle-orm utilities for convenience
export { eq, and, or, desc, asc, sql } from "drizzle-orm";

// Re-export schema types for convenience
export {
  // Core Phase 1 tables
  chatSessions,
  chatMessages,
  composeHistory,
  snapshots,
  // Phase 2 tables
  memories,
  entities,
  memoryEntities,
  tasks,
  taskDependencies,
  // Type exports
  type ChatSession,
  type NewChatSession,
  type ChatMessage,
  type NewChatMessage,
  type ComposeHistory,
  type NewComposeHistory,
  type Snapshot,
  type NewSnapshot,
  type Memory,
  type NewMemory,
  type Entity,
  type NewEntity,
  type MemoryEntity,
  type NewMemoryEntity,
  type Task,
  type NewTask,
  type TaskDependency,
  type NewTaskDependency,
} from "./schema";
