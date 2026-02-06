/**
 * Memory Store Service
 *
 * Exports for memory management, semantic search, and entity linking.
 */

// Types
export {
  MemoryError,
  type MemoryType,
  type MemoryErrorCode,
  type ListMemoriesOptions,
  type ListEntitiesOptions,
  type UpdateMemoryFields,
  type MemorySearchResult,
} from "./types";

// Service functions
export {
  // Memory CRUD
  createMemory,
  getMemoryById,
  listMemories,
  updateMemory,
  deleteMemory,
  // Semantic search
  searchMemories,
  // Entity CRUD
  createEntity,
  getEntityById,
  listEntities,
  // Memory-Entity linking
  linkMemoryToEntity,
  unlinkMemoryFromEntity,
  getMemoryEntities,
  getEntityMemories,
} from "./service";
