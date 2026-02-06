/**
 * Memory Router - tRPC router for memory store operations
 *
 * Provides comprehensive memory management:
 * - List, get, create, update, and delete memories
 * - Semantic search using pgvector
 * - Entity CRUD operations
 * - Memory-entity linking and unlinking
 *
 * @module routers/memory
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../index";
import type { Memory, Entity, MemoryEntity } from "@ClawDock/db";
import { MemoryError, type MemoryErrorCode } from "../lib/memory/types";
import type { MemorySearchResult } from "../lib/memory/types";
import {
  createMemory,
  getMemoryById,
  listMemories,
  updateMemory,
  deleteMemory,
  searchMemories,
  createEntity,
  getEntityById,
  listEntities,
  linkMemoryToEntity,
  unlinkMemoryFromEntity,
  getMemoryEntities,
  getEntityMemories,
} from "../lib/memory/service";

// ============================================================================
// Helper: Convert MemoryError to TRPCError
// ============================================================================

/**
 * Maps MemoryError codes to TRPCError codes
 */
function mapMemoryErrorToTRPC(error: MemoryError): TRPCError {
  const codeMap = {
    NOT_FOUND: "NOT_FOUND",
    VALIDATION_ERROR: "BAD_REQUEST",
    LINK_EXISTS: "BAD_REQUEST",
    LINK_NOT_FOUND: "NOT_FOUND",
    DB_ERROR: "INTERNAL_SERVER_ERROR",
    EMBEDDING_ERROR: "INTERNAL_SERVER_ERROR",
  } satisfies Record<MemoryErrorCode, TRPCError["code"]>;

  return new TRPCError({
    code: codeMap[error.code] ?? "INTERNAL_SERVER_ERROR",
    message: error.message,
    cause: error,
  });
}

// ============================================================================
// Schemas
// ============================================================================

const MemoryIdSchema = z.object({
  id: z.string().uuid(),
});

const EntityIdSchema = z.object({
  id: z.string().uuid(),
});

const MemoryTypeSchema = z.enum(["fact", "conversation", "entity", "preference"]);

const ListMemoriesSchema = z.object({
  type: MemoryTypeSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

const CreateMemorySchema = z.object({
  content: z.string().min(1, "Content is required"),
  memoryType: MemoryTypeSchema,
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const UpdateMemorySchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).optional(),
  memoryType: MemoryTypeSchema.optional(),
  source: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const SearchMemoriesSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  limit: z.number().min(1).max(100).optional().default(10),
});

const ListEntitiesSchema = z.object({
  type: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

const CreateEntitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  entityType: z.string().min(1, "Entity type is required"),
  description: z.string().optional(),
});

const LinkEntitySchema = z.object({
  memoryId: z.string().uuid(),
  entityId: z.string().uuid(),
  relationship: z.string().optional(),
});

const UnlinkEntitySchema = z.object({
  memoryId: z.string().uuid(),
  entityId: z.string().uuid(),
});

// ============================================================================
// Router
// ============================================================================

export const memoryRouter = router({
  /**
   * List memories with optional filters
   *
   * Returns memories sorted by creation date (newest first).
   * Supports filtering by type and pagination.
   *
   * @param input.type - Optional memory type filter
   * @param input.limit - Maximum number of memories to return (default: 50)
   * @param input.offset - Number of memories to skip (default: 0)
   */
  listMemories: publicProcedure
    .input(ListMemoriesSchema)
    .query(async ({ input }): Promise<Memory[]> => {
      try {
        return await listMemories({
          type: input.type,
          limit: input.limit,
          offset: input.offset,
        });
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list memories",
        });
      }
    }),

  /**
   * Get a specific memory by ID
   *
   * @param input.id - The UUID of the memory to retrieve
   * @returns The memory or throws NOT_FOUND if not found
   */
  getMemory: publicProcedure
    .input(MemoryIdSchema)
    .query(async ({ input }): Promise<Memory> => {
      try {
        const memory = await getMemoryById(input.id);

        if (!memory) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Memory with ID '${input.id}' not found`,
          });
        }

        return memory;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get memory",
        });
      }
    }),

  /**
   * Create a new memory
   *
   * @param input.content - The memory content (required)
   * @param input.memoryType - Type of memory (fact, conversation, entity, preference)
   * @param input.source - Optional source of the memory
   * @param input.metadata - Optional additional metadata
   * @returns The created memory
   */
  createMemory: publicProcedure
    .input(CreateMemorySchema)
    .mutation(async ({ input }): Promise<Memory> => {
      try {
        return await createMemory(
          input.content,
          input.memoryType,
          input.source,
          input.metadata
        );
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create memory",
        });
      }
    }),

  /**
   * Update an existing memory
   *
   * @param input.id - The UUID of the memory to update
   * @param input.content - New content (optional)
   * @param input.memoryType - New memory type (optional)
   * @param input.source - New source (optional)
   * @param input.metadata - New metadata (optional)
   * @returns The updated memory
   */
  updateMemory: publicProcedure
    .input(UpdateMemorySchema)
    .mutation(async ({ input }): Promise<Memory> => {
      try {
        const { id, ...updates } = input;
        return await updateMemory(id, {
          content: updates.content,
          memoryType: updates.memoryType,
          source: updates.source,
          metadata: updates.metadata,
        });
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to update memory",
        });
      }
    }),

  /**
   * Delete a memory
   *
   * Permanently removes a memory and its entity links.
   *
   * @param input.id - The UUID of the memory to delete
   * @returns Success indicator
   */
  deleteMemory: publicProcedure
    .input(MemoryIdSchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      try {
        await deleteMemory(input.id);

        return { success: true };
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete memory",
        });
      }
    }),

  /**
   * Search memories using semantic similarity
   *
   * Uses pgvector cosine distance to find the most similar memories.
   * Lower distance = more similar.
   *
   * @param input.query - The search query text
   * @param input.limit - Maximum number of results (default: 10)
   * @returns Array of memories with similarity scores
   */
  searchMemories: publicProcedure
    .input(SearchMemoriesSchema)
    .query(async ({ input }): Promise<MemorySearchResult[]> => {
      try {
        return await searchMemories(input.query, input.limit);
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to search memories",
        });
      }
    }),

  /**
   * List all entities with optional filters
   *
   * Returns entities sorted by creation date (newest first).
   *
   * @param input.type - Optional entity type filter
   * @param input.limit - Maximum number of entities to return (default: 50)
   */
  listEntities: publicProcedure
    .input(ListEntitiesSchema)
    .query(async ({ input }): Promise<Entity[]> => {
      try {
        return await listEntities({
          type: input.type,
          limit: input.limit,
        });
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list entities",
        });
      }
    }),

  /**
   * Get a specific entity by ID
   *
   * @param input.id - The UUID of the entity to retrieve
   * @returns The entity or throws NOT_FOUND if not found
   */
  getEntity: publicProcedure
    .input(EntityIdSchema)
    .query(async ({ input }): Promise<Entity> => {
      try {
        const entity = await getEntityById(input.id);

        if (!entity) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Entity with ID '${input.id}' not found`,
          });
        }

        return entity;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get entity",
        });
      }
    }),

  /**
   * Create a new entity
   *
   * @param input.name - The entity name (required)
   * @param input.entityType - Type of entity (e.g., "person", "project", "concept")
   * @param input.description - Optional description
   * @returns The created entity
   */
  createEntity: publicProcedure
    .input(CreateEntitySchema)
    .mutation(async ({ input }): Promise<Entity> => {
      try {
        return await createEntity(
          input.name,
          input.entityType,
          input.description
        );
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create entity",
        });
      }
    }),

  /**
   * Link a memory to an entity
   *
   * Creates a relationship between a memory and an entity.
   *
   * @param input.memoryId - The memory UUID
   * @param input.entityId - The entity UUID
   * @param input.relationship - Optional relationship type (default: "mentions")
   * @returns The created link
   */
  linkEntity: publicProcedure
    .input(LinkEntitySchema)
    .mutation(async ({ input }): Promise<MemoryEntity> => {
      try {
        return await linkMemoryToEntity(
          input.memoryId,
          input.entityId,
          input.relationship
        );
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to link entity",
        });
      }
    }),

  /**
   * Unlink a memory from an entity
   *
   * Removes the relationship between a memory and an entity.
   *
   * @param input.memoryId - The memory UUID
   * @param input.entityId - The entity UUID
   * @returns Success indicator
   */
  unlinkEntity: publicProcedure
    .input(UnlinkEntitySchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      try {
        await unlinkMemoryFromEntity(input.memoryId, input.entityId);

        return { success: true };
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to unlink entity",
        });
      }
    }),

  /**
   * Get all entities linked to a memory
   *
   * @param input.id - The memory UUID
   * @returns Array of entities linked to the memory
   */
  getMemoryEntities: publicProcedure
    .input(MemoryIdSchema)
    .query(async ({ input }): Promise<Entity[]> => {
      try {
        return await getMemoryEntities(input.id);
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get memory entities",
        });
      }
    }),

  /**
   * Get all memories linked to an entity
   *
   * @param input.id - The entity UUID
   * @returns Array of memories linked to the entity
   */
  getEntityMemories: publicProcedure
    .input(EntityIdSchema)
    .query(async ({ input }): Promise<Memory[]> => {
      try {
        return await getEntityMemories(input.id);
      } catch (error) {
        if (error instanceof MemoryError) {
          throw mapMemoryErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get entity memories",
        });
      }
    }),
});

export type MemoryRouter = typeof memoryRouter;
