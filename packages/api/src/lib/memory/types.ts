/**
 * Memory Store Service Types
 *
 * Type definitions for the memory management system that provides
 * semantic search and entity linking capabilities for ClawDock agents.
 */

// ============================================================================
// Memory Types and Options
// ============================================================================

/**
 * Valid memory types matching the database enum
 */
export type MemoryType = 'fact' | 'conversation' | 'entity' | 'preference';

/**
 * Options for listing memories with filters
 */
export interface ListMemoriesOptions {
  /** Filter by memory type */
  type?: MemoryType;
  /** Maximum number of memories to return */
  limit?: number;
  /** Number of memories to skip (for pagination) */
  offset?: number;
}

/**
 * Options for listing entities with filters
 */
export interface ListEntitiesOptions {
  /** Filter by entity type */
  type?: string;
  /** Maximum number of entities to return */
  limit?: number;
}

/**
 * Fields that can be updated on a memory
 */
export interface UpdateMemoryFields {
  /** Memory content */
  content?: string;
  /** Memory type */
  memoryType?: MemoryType;
  /** Source of the memory */
  source?: string | null;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from semantic search including similarity score
 */
export interface MemorySearchResult {
  /** Memory ID */
  id: string;
  /** Memory content */
  content: string;
  /** Memory type */
  memoryType: MemoryType;
  /** Source of the memory */
  source: string | null;
  /** When the memory was created */
  createdAt: Date;
  /** When the memory was last updated */
  updatedAt: Date;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Cosine distance (lower = more similar) */
  distance: number;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes specific to memory operations
 */
export type MemoryErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'LINK_EXISTS'
  | 'LINK_NOT_FOUND'
  | 'DB_ERROR'
  | 'EMBEDDING_ERROR';

/**
 * Custom error class for memory operations
 * Provides structured error information for better handling
 */
export class MemoryError extends Error {
  constructor(
    message: string,
    public code: MemoryErrorCode,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}
