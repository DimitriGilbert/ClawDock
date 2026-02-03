import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
  customType,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Custom Types
// ============================================================================

/**
 * Vector type for pgvector extension
 * Used for memory embeddings (1536 dimensions for OpenAI ada-002)
 */
const vector = customType<{
  data: number[];
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
});

// ============================================================================
// Phase 1 Tables: Core Loop MVP
// ============================================================================

/**
 * Chat sessions for the Chat Bay
 * Each conversation is a separate session
 */
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (table) => ({
    createdAtIdx: index('idx_chat_sessions_created').on(table.createdAt),
    updatedAtIdx: index('idx_chat_sessions_updated').on(table.updatedAt),
  })
);

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  messages: many(chatMessages),
}));

/**
 * Individual chat messages within a session
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (table) => ({
    sessionIdIdx: index('idx_chat_messages_session').on(table.sessionId),
    createdAtIdx: index('idx_chat_messages_created').on(table.createdAt),
  })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

/**
 * Compose file history for rollback functionality
 * Stores snapshots of docker-compose.yml changes
 */
export const composeHistory = pgTable(
  'compose_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by').default('system').notNull(),
    comment: text('comment'),
  },
  (table) => ({
    createdAtIdx: index('idx_compose_history_created').on(table.createdAt),
  })
);

/**
 * Snapshot metadata for git-based snapshots
 */
export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitHash: text('commit_hash').notNull(),
    snapshotType: text('snapshot_type', {
      enum: ['auto', 'manual', 'pre-change'],
    }).notNull(),
    triggerSource: text('trigger_source'),
    comment: text('comment'),
    fileCount: integer('file_count').default(0).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0).notNull(),
    dbBackupPath: text('db_backup_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index('idx_snapshots_created').on(table.createdAt),
    typeIdx: index('idx_snapshots_type').on(table.snapshotType),
  })
);

// ============================================================================
// Phase 2 Tables: Memory Store (Preparation)
// ============================================================================

/**
 * Memory embeddings for semantic search
 * Uses pgvector extension for vector similarity search
 */
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    memoryType: text('memory_type', {
      enum: ['fact', 'conversation', 'entity', 'preference'],
    }).notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (table) => ({
    // Note: Vector index using ivfflat needs to be created manually via SQL
    // CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
    typeIdx: index('idx_memories_type').on(table.memoryType),
    createdAtIdx: index('idx_memories_created').on(table.createdAt),
  })
);

export const memoriesRelations = relations(memories, ({ many }) => ({
  entities: many(memoryEntities),
}));

/**
 * Entity tracking for people, projects, concepts, etc.
 */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    entityType: text('entity_type').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (table) => ({
    nameTypeIdx: uniqueIndex('idx_entities_name_type').on(table.name, table.entityType),
  })
);

export const entitiesRelations = relations(entities, ({ many }) => ({
  memories: many(memoryEntities),
}));

/**
 * Junction table linking memories to entities
 */
export const memoryEntities = pgTable(
  'memory_entities',
  {
    memoryId: uuid('memory_id')
      .references(() => memories.id, { onDelete: 'cascade' })
      .notNull(),
    entityId: uuid('entity_id')
      .references(() => entities.id, { onDelete: 'cascade' })
      .notNull(),
    relationship: text('relationship').default('mentions').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.memoryId, table.entityId] }),
  })
);

export const memoryEntitiesRelations = relations(memoryEntities, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryEntities.memoryId],
    references: [memories.id],
  }),
  entity: one(entities, {
    fields: [memoryEntities.entityId],
    references: [entities.id],
  }),
}));

// ============================================================================
// Phase 2 Tables: Task Tracker (Preparation)
// ============================================================================

/**
 * Tasks for the Task Tracker
 * The Agent's todo list and project management
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', {
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    })
      .default('pending')
      .notNull(),
    priority: integer('priority').default(50).notNull(),
    source: text('source'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (table) => ({
    statusIdx: index('idx_tasks_status').on(table.status),
    priorityIdx: index('idx_tasks_priority').on(table.priority),
    dueAtIdx: index('idx_tasks_due').on(table.dueAt),
  })
);

/**
 * Task dependencies for tracking task relationships
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    dependsOnId: uuid('depends_on_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.dependsOnId] }),
    // Constraint: task_id != depends_on_id is enforced at application level
  })
);

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: 'task',
  }),
  dependsOn: one(tasks, {
    fields: [taskDependencies.dependsOnId],
    references: [tasks.id],
    relationName: 'dependsOn',
  }),
}));

// ============================================================================
// Type Exports (for TypeScript usage)
// ============================================================================

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type ComposeHistory = typeof composeHistory.$inferSelect;
export type NewComposeHistory = typeof composeHistory.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type MemoryEntity = typeof memoryEntities.$inferSelect;
export type NewMemoryEntity = typeof memoryEntities.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type NewTaskDependency = typeof taskDependencies.$inferInsert;
