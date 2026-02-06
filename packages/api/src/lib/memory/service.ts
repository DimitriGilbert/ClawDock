/**
 * Memory Store Service
 *
 * Core service for managing memories and entities in ClawDock's agent memory system.
 * Provides CRUD operations, semantic search using pgvector, and entity linking.
 */

import {
  db,
  memories,
  entities,
  memoryEntities,
  eq,
  and,
  desc,
  sql,
  type Memory,
  type NewMemory,
  type Entity,
  type NewEntity,
  type MemoryEntity,
} from "@ClawDock/db";
import { MemoryError } from "./types";
import type {
  MemoryType,
  ListMemoriesOptions,
  ListEntitiesOptions,
  UpdateMemoryFields,
  MemorySearchResult,
} from "./types";

// ============================================================================
// Embedding Generation (Stub)
// ============================================================================

/**
 * Generates a vector embedding for the given content
 *
 * TODO: Replace with actual OpenAI/embedding provider call
 * Returns 1536-dimension placeholder for ada-002 compatibility
 *
 * @param content - The text content to embed
 * @returns A 1536-dimensional vector
 */
async function generateEmbedding(content: string): Promise<number[]> {
  // TODO: Replace with actual OpenAI/embedding provider call
  // Returns 1536-dimension placeholder for ada-002 compatibility
  void content; // Suppress unused variable warning
  return new Array(1536).fill(0.0) as number[];
}

// ============================================================================
// Memory CRUD Operations
// ============================================================================

/**
 * Creates a new memory with optional embedding
 *
 * @param content - The memory content (required)
 * @param memoryType - Type of memory (fact, conversation, entity, preference)
 * @param source - Optional source of the memory
 * @param metadata - Optional additional metadata
 * @returns The created memory
 * @throws MemoryError if creation fails
 */
export async function createMemory(
  content: string,
  memoryType: MemoryType,
  source?: string,
  metadata?: Record<string, unknown>
): Promise<Memory> {
  try {
    if (!content || content.trim().length === 0) {
      throw new MemoryError(
        "Memory content is required and cannot be empty",
        "VALIDATION_ERROR",
        { content }
      );
    }

    const validTypes: MemoryType[] = ['fact', 'conversation', 'entity', 'preference'];
    if (!validTypes.includes(memoryType)) {
      throw new MemoryError(
        `Invalid memory type: ${memoryType}. Must be one of: ${validTypes.join(', ')}`,
        "VALIDATION_ERROR",
        { memoryType }
      );
    }

    // Generate embedding for semantic search
    const embedding = await generateEmbedding(content);

    const now = new Date();
    const newMemory: NewMemory = {
      content: content.trim(),
      embedding,
      memoryType,
      source: source ?? null,
      createdAt: now,
      updatedAt: now,
      metadata: metadata ?? {},
    };

    const [created] = await db.insert(memories).values(newMemory).returning();

    if (!created) {
      throw new MemoryError(
        "Failed to create memory - no memory returned",
        "DB_ERROR",
        { content }
      );
    }

    return created;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to create memory: ${errorMessage}`,
      "DB_ERROR",
      { content, error: errorMessage }
    );
  }
}

/**
 * Gets a memory by its ID
 *
 * @param id - The memory UUID
 * @returns The memory or null if not found
 * @throws MemoryError if database operation fails
 */
export async function getMemoryById(id: string): Promise<Memory | null> {
  try {
    const memory = await db.query.memories.findFirst({
      where: eq(memories.id, id),
    });

    return memory ?? null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to get memory: ${errorMessage}`,
      "DB_ERROR",
      { id, error: errorMessage }
    );
  }
}

/**
 * Lists memories with optional filters
 *
 * @param options - Filter and pagination options
 * @returns Array of memories
 * @throws MemoryError if database operation fails
 */
export async function listMemories(options: ListMemoriesOptions = {}): Promise<Memory[]> {
  try {
    const { type, limit = 50, offset = 0 } = options;

    let query = db.select().from(memories);

    if (type) {
      query = query.where(eq(memories.memoryType, type)) as typeof query;
    }

    const result = await query
      .orderBy(desc(memories.createdAt))
      .limit(limit)
      .offset(offset);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to list memories: ${errorMessage}`,
      "DB_ERROR",
      { options, error: errorMessage }
    );
  }
}

/**
 * Updates a memory's fields
 *
 * @param id - The memory UUID
 * @param updates - Partial memory fields to update
 * @returns The updated memory
 * @throws MemoryError if memory not found or update fails
 */
export async function updateMemory(
  id: string,
  updates: UpdateMemoryFields
): Promise<Memory> {
  try {
    const existing = await getMemoryById(id);
    if (!existing) {
      throw new MemoryError(
        `Memory with ID '${id}' not found`,
        "NOT_FOUND",
        { id }
      );
    }

    const updateValues: Partial<NewMemory> = {
      updatedAt: new Date(),
    };

    if (updates.content !== undefined) {
      if (!updates.content || updates.content.trim().length === 0) {
        throw new MemoryError(
          "Memory content cannot be empty",
          "VALIDATION_ERROR",
          { id, content: updates.content }
        );
      }
      updateValues.content = updates.content.trim();
      // Re-generate embedding when content changes
      updateValues.embedding = await generateEmbedding(updates.content);
    }

    if (updates.memoryType !== undefined) {
      const validTypes: MemoryType[] = ['fact', 'conversation', 'entity', 'preference'];
      if (!validTypes.includes(updates.memoryType)) {
        throw new MemoryError(
          `Invalid memory type: ${updates.memoryType}`,
          "VALIDATION_ERROR",
          { id, memoryType: updates.memoryType }
        );
      }
      updateValues.memoryType = updates.memoryType;
    }

    if (updates.source !== undefined) {
      updateValues.source = updates.source;
    }

    if (updates.metadata !== undefined) {
      updateValues.metadata = updates.metadata;
    }

    const [updated] = await db
      .update(memories)
      .set(updateValues)
      .where(eq(memories.id, id))
      .returning();

    if (!updated) {
      throw new MemoryError(
        `Failed to update memory - memory not found after update`,
        "NOT_FOUND",
        { id }
      );
    }

    return updated;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to update memory: ${errorMessage}`,
      "DB_ERROR",
      { id, updates, error: errorMessage }
    );
  }
}

/**
 * Deletes a memory and its entity links
 *
 * @param id - The memory UUID
 * @throws MemoryError if memory not found or deletion fails
 */
export async function deleteMemory(id: string): Promise<void> {
  try {
    const existing = await getMemoryById(id);
    if (!existing) {
      throw new MemoryError(
        `Memory with ID '${id}' not found`,
        "NOT_FOUND",
        { id }
      );
    }

    // Delete the memory (cascades to memoryEntities due to foreign key constraints)
    await db.delete(memories).where(eq(memories.id, id));
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to delete memory: ${errorMessage}`,
      "DB_ERROR",
      { id, error: errorMessage }
    );
  }
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Searches memories using semantic similarity via pgvector
 *
 * Uses cosine distance to find the most similar memories to the query.
 * Lower distance = more similar.
 *
 * @param query - The search query text
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of memories with similarity scores
 * @throws MemoryError if search fails
 */
export async function searchMemories(
  query: string,
  limit: number = 10
): Promise<MemorySearchResult[]> {
  try {
    if (!query || query.trim().length === 0) {
      throw new MemoryError(
        "Search query is required and cannot be empty",
        "VALIDATION_ERROR",
        { query }
      );
    }

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);

    // Convert embedding array to pgvector format string
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Use raw SQL for pgvector cosine similarity search
    const results = await db.execute(sql`
      SELECT 
        id,
        content,
        memory_type as "memoryType",
        source,
        created_at as "createdAt",
        updated_at as "updatedAt",
        metadata,
        embedding <=> ${embeddingStr}::vector AS distance
      FROM memories
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);

    // Map raw results to typed MemorySearchResult
    const typedResults: MemorySearchResult[] = [];
    
    for (const row of results.rows) {
      const typedRow = row as Record<string, unknown>;
      typedResults.push({
        id: typedRow.id as string,
        content: typedRow.content as string,
        memoryType: typedRow.memoryType as MemoryType,
        source: typedRow.source as string | null,
        createdAt: new Date(typedRow.createdAt as string),
        updatedAt: new Date(typedRow.updatedAt as string),
        metadata: (typedRow.metadata as Record<string, unknown>) ?? {},
        distance: Number(typedRow.distance),
      });
    }

    return typedResults;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to search memories: ${errorMessage}`,
      "DB_ERROR",
      { query, error: errorMessage }
    );
  }
}

// ============================================================================
// Entity CRUD Operations
// ============================================================================

/**
 * Creates a new entity
 *
 * @param name - The entity name (required)
 * @param entityType - Type of entity (e.g., "person", "project", "concept")
 * @param description - Optional description
 * @returns The created entity
 * @throws MemoryError if creation fails
 */
export async function createEntity(
  name: string,
  entityType: string,
  description?: string
): Promise<Entity> {
  try {
    if (!name || name.trim().length === 0) {
      throw new MemoryError(
        "Entity name is required and cannot be empty",
        "VALIDATION_ERROR",
        { name }
      );
    }

    if (!entityType || entityType.trim().length === 0) {
      throw new MemoryError(
        "Entity type is required and cannot be empty",
        "VALIDATION_ERROR",
        { entityType }
      );
    }

    const now = new Date();
    const newEntity: NewEntity = {
      name: name.trim(),
      entityType: entityType.trim(),
      description: description ?? null,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    const [created] = await db.insert(entities).values(newEntity).returning();

    if (!created) {
      throw new MemoryError(
        "Failed to create entity - no entity returned",
        "DB_ERROR",
        { name }
      );
    }

    return created;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to create entity: ${errorMessage}`,
      "DB_ERROR",
      { name, error: errorMessage }
    );
  }
}

/**
 * Gets an entity by its ID
 *
 * @param id - The entity UUID
 * @returns The entity or null if not found
 * @throws MemoryError if database operation fails
 */
export async function getEntityById(id: string): Promise<Entity | null> {
  try {
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, id),
    });

    return entity ?? null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to get entity: ${errorMessage}`,
      "DB_ERROR",
      { id, error: errorMessage }
    );
  }
}

/**
 * Lists entities with optional filters
 *
 * @param options - Filter and pagination options
 * @returns Array of entities
 * @throws MemoryError if database operation fails
 */
export async function listEntities(options: ListEntitiesOptions = {}): Promise<Entity[]> {
  try {
    const { type, limit = 50 } = options;

    let query = db.select().from(entities);

    if (type) {
      query = query.where(eq(entities.entityType, type)) as typeof query;
    }

    const result = await query
      .orderBy(desc(entities.createdAt))
      .limit(limit);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to list entities: ${errorMessage}`,
      "DB_ERROR",
      { options, error: errorMessage }
    );
  }
}

// ============================================================================
// Memory-Entity Linking
// ============================================================================

/**
 * Links a memory to an entity
 *
 * @param memoryId - The memory UUID
 * @param entityId - The entity UUID
 * @param relationship - Optional relationship type (default: "mentions")
 * @returns The created link
 * @throws MemoryError if memory/entity not found, link already exists, or creation fails
 */
export async function linkMemoryToEntity(
  memoryId: string,
  entityId: string,
  relationship?: string
): Promise<MemoryEntity> {
  try {
    // Verify memory exists
    const memory = await getMemoryById(memoryId);
    if (!memory) {
      throw new MemoryError(
        `Memory with ID '${memoryId}' not found`,
        "NOT_FOUND",
        { memoryId }
      );
    }

    // Verify entity exists
    const entity = await getEntityById(entityId);
    if (!entity) {
      throw new MemoryError(
        `Entity with ID '${entityId}' not found`,
        "NOT_FOUND",
        { entityId }
      );
    }

    // Check if link already exists
    const existingLink = await db
      .select()
      .from(memoryEntities)
      .where(
        and(
          eq(memoryEntities.memoryId, memoryId),
          eq(memoryEntities.entityId, entityId)
        )
      )
      .limit(1);

    if (existingLink.length > 0) {
      throw new MemoryError(
        "This memory-entity link already exists",
        "LINK_EXISTS",
        { memoryId, entityId }
      );
    }

    // Create the link
    const [created] = await db
      .insert(memoryEntities)
      .values({
        memoryId,
        entityId,
        relationship: relationship ?? "mentions",
      })
      .returning();

    if (!created) {
      throw new MemoryError(
        "Failed to create memory-entity link - no link returned",
        "DB_ERROR",
        { memoryId, entityId }
      );
    }

    return created;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to link memory to entity: ${errorMessage}`,
      "DB_ERROR",
      { memoryId, entityId, error: errorMessage }
    );
  }
}

/**
 * Removes a link between a memory and an entity
 *
 * @param memoryId - The memory UUID
 * @param entityId - The entity UUID
 * @throws MemoryError if link not found or removal fails
 */
export async function unlinkMemoryFromEntity(
  memoryId: string,
  entityId: string
): Promise<void> {
  try {
    const result = await db
      .delete(memoryEntities)
      .where(
        and(
          eq(memoryEntities.memoryId, memoryId),
          eq(memoryEntities.entityId, entityId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new MemoryError(
        "Memory-entity link not found",
        "NOT_FOUND",
        { memoryId, entityId }
      );
    }
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to unlink memory from entity: ${errorMessage}`,
      "DB_ERROR",
      { memoryId, entityId, error: errorMessage }
    );
  }
}

/**
 * Gets all entities linked to a memory
 *
 * @param memoryId - The memory UUID
 * @returns Array of entities linked to the memory
 * @throws MemoryError if memory not found or query fails
 */
export async function getMemoryEntities(memoryId: string): Promise<Entity[]> {
  try {
    // Verify memory exists
    const memory = await getMemoryById(memoryId);
    if (!memory) {
      throw new MemoryError(
        `Memory with ID '${memoryId}' not found`,
        "NOT_FOUND",
        { memoryId }
      );
    }

    // Get all entity links for this memory
    const links = await db
      .select({ entityId: memoryEntities.entityId })
      .from(memoryEntities)
      .where(eq(memoryEntities.memoryId, memoryId));

    if (links.length === 0) {
      return [];
    }

    // Fetch all linked entities
    const linkedEntities: Entity[] = [];
    for (const link of links) {
      const entity = await getEntityById(link.entityId);
      if (entity) {
        linkedEntities.push(entity);
      }
    }

    return linkedEntities;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to get memory entities: ${errorMessage}`,
      "DB_ERROR",
      { memoryId, error: errorMessage }
    );
  }
}

/**
 * Gets all memories linked to an entity
 *
 * @param entityId - The entity UUID
 * @returns Array of memories linked to the entity
 * @throws MemoryError if entity not found or query fails
 */
export async function getEntityMemories(entityId: string): Promise<Memory[]> {
  try {
    // Verify entity exists
    const entity = await getEntityById(entityId);
    if (!entity) {
      throw new MemoryError(
        `Entity with ID '${entityId}' not found`,
        "NOT_FOUND",
        { entityId }
      );
    }

    // Get all memory links for this entity
    const links = await db
      .select({ memoryId: memoryEntities.memoryId })
      .from(memoryEntities)
      .where(eq(memoryEntities.entityId, entityId));

    if (links.length === 0) {
      return [];
    }

    // Fetch all linked memories
    const linkedMemories: Memory[] = [];
    for (const link of links) {
      const memory = await getMemoryById(link.memoryId);
      if (memory) {
        linkedMemories.push(memory);
      }
    }

    return linkedMemories;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new MemoryError(
      `Failed to get entity memories: ${errorMessage}`,
      "DB_ERROR",
      { entityId, error: errorMessage }
    );
  }
}
