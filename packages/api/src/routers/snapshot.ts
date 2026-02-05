/**
 * Snapshot Router - Expanded tRPC router for snapshot operations
 *
 * Provides comprehensive snapshot management:
 * - List, get, and preview snapshots
 * - Create, restore, and delete snapshots
 * - Prune old snapshots and manage settings
 *
 * @module routers/snapshot
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../index";
import type { Snapshot, SnapshotSettings, DiffResult } from "../lib/snapshot/types";
import { SnapshotError } from "../lib/snapshot/types";
import {
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  listSnapshots,
  getSnapshotById,
  getSnapshotDiff,
  pruneSnapshots,
  getSettings,
  updateSettings,
} from "../lib/snapshot/service";

// ============================================================================
// Helper: Convert SnapshotError to TRPCError
// ============================================================================

/**
 * Maps SnapshotError codes to TRPCError codes
 */
function mapSnapshotErrorToTRPC(error: SnapshotError): TRPCError {
  const codeMap: Record<string, TRPCError["code"]> = {
    NOT_FOUND: "NOT_FOUND",
    VALIDATION_ERROR: "BAD_REQUEST",
    GIT_ERROR: "INTERNAL_SERVER_ERROR",
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

const SnapshotIdSchema = z.object({
  id: z.string().uuid(),
});

const CreateSnapshotSchema = z.object({
  comment: z.string().optional(),
  includeDatabase: z.boolean().optional().default(true),
});

const RestoreSnapshotSchema = z.object({
  id: z.string().uuid(),
  includeDatabase: z.boolean().optional().default(true),
});

const PruneSnapshotsSchema = z.object({
  keepLast: z.number().min(1).max(100).default(30),
});

const UpdateSettingsSchema = z.object({
  maxSnapshots: z.number().min(1).max(100).optional(),
  preChangeCompose: z.boolean().optional(),
  preChangeAgentFiles: z.boolean().optional(),
  includeDatabase: z.boolean().optional(),
});

// ============================================================================
// Router
// ============================================================================

export const snapshotRouter = router({
  /**
   * List all snapshots
   *
   * Returns all snapshots sorted by timestamp (newest first).
   * Includes metadata like file count, size, and type.
   */
  list: publicProcedure.query(async (): Promise<Snapshot[]> => {
    try {
      return await listSnapshots();
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw mapSnapshotErrorToTRPC(error);
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to list snapshots",
      });
    }
  }),

  /**
   * Get a specific snapshot by ID
   *
   * @param input.id - The UUID of the snapshot to retrieve
   * @returns The snapshot or null if not found
   */
  get: publicProcedure
    .input(SnapshotIdSchema)
    .query(async ({ input }): Promise<Snapshot | null> => {
      try {
        const snapshot = await getSnapshotById(input.id);

        if (!snapshot) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Snapshot with ID '${input.id}' not found`,
          });
        }

        return snapshot;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get snapshot",
        });
      }
    }),

  /**
   * Preview restore - get diff before restoring
   *
   * Shows what changes will be applied when restoring to this snapshot.
   * Useful for reviewing changes before committing to a restore.
   *
   * @param input.id - The UUID of the snapshot to preview
   * @returns Diff result showing files changed, additions, and deletions
   */
  previewRestore: publicProcedure
    .input(SnapshotIdSchema)
    .query(async ({ input }): Promise<DiffResult> => {
      try {
        return await getSnapshotDiff(input.id);
      } catch (error) {
        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get snapshot diff",
        });
      }
    }),

  /**
   * Get snapshot settings
   *
   * Returns current snapshot configuration including:
   * - maxSnapshots: Maximum number of snapshots to retain
   * - preChangeCompose: Whether to auto-snapshot before compose changes
   * - preChangeAgentFiles: Whether to auto-snapshot before agent file edits
   * - includeDatabase: Default setting for database inclusion
   */
  getSettings: publicProcedure.query(async (): Promise<SnapshotSettings> => {
    try {
      return await getSettings();
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw mapSnapshotErrorToTRPC(error);
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to get settings",
      });
    }
  }),

  /**
   * Create a manual snapshot
   *
   * Creates a new snapshot of the current system state.
   * Optionally includes a database backup.
   *
   * @param input.comment - Optional description of the snapshot
   * @param input.includeDatabase - Whether to include database backup (default: true)
   * @returns The created snapshot with metadata
   */
  create: publicProcedure
    .input(CreateSnapshotSchema)
    .mutation(async ({ input }): Promise<Snapshot> => {
      try {
        return await createSnapshot({
          type: "manual",
          comment: input.comment || "Manual snapshot",
          includeDatabase: input.includeDatabase,
        });
      } catch (error) {
        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create snapshot",
        });
      }
    }),

  /**
   * Restore to a snapshot
   *
   * Restores the system to the state captured in the specified snapshot.
   * Creates a pre-restore safety snapshot before making changes.
   * Optionally restores the database from backup.
   *
   * @param input.id - The UUID of the snapshot to restore
   * @param input.includeDatabase - Whether to restore database (default: true)
   * @returns Success indicator
   */
  restore: publicProcedure
    .input(RestoreSnapshotSchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      try {
        await restoreSnapshot(input.id, {
          includeDatabase: input.includeDatabase,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to restore snapshot",
        });
      }
    }),

  /**
   * Delete a snapshot
   *
   * Permanently removes a snapshot and its associated resources
   * (git tag, database backup file).
   *
   * @param input.id - The UUID of the snapshot to delete
   * @returns Success indicator
   */
  delete: publicProcedure
    .input(SnapshotIdSchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      try {
        await deleteSnapshot(input.id);

        return { success: true };
      } catch (error) {
        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete snapshot",
        });
      }
    }),

  /**
   * Prune old snapshots
   *
   * Removes old snapshots to maintain the retention limit.
   * Keeps the specified number of most recent snapshots.
   *
   * @param input.keepLast - Number of snapshots to keep (default: 30, min: 1, max: 100)
   * @returns Number of snapshots deleted
   */
  prune: publicProcedure
    .input(PruneSnapshotsSchema)
    .mutation(async ({ input }): Promise<{ deleted: number }> => {
      try {
        const deleted = await pruneSnapshots(input.keepLast);

        return { deleted };
      } catch (error) {
        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to prune snapshots",
        });
      }
    }),

  /**
   * Update snapshot settings
   *
   * Updates the snapshot system configuration.
   * Only provided fields are updated; others remain unchanged.
   *
   * @param input.maxSnapshots - Maximum snapshots to retain
   * @param input.preChangeCompose - Auto-snapshot before compose changes
   * @param input.preChangeAgentFiles - Auto-snapshot before agent file edits
   * @param input.includeDatabase - Default database inclusion setting
   * @returns Updated settings
   */
  updateSettings: publicProcedure
    .input(UpdateSettingsSchema)
    .mutation(async ({ input }): Promise<SnapshotSettings> => {
      try {
        return await updateSettings(input);
      } catch (error) {
        if (error instanceof SnapshotError) {
          throw mapSnapshotErrorToTRPC(error);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to update settings",
        });
      }
    }),
});

export type SnapshotRouter = typeof snapshotRouter;
