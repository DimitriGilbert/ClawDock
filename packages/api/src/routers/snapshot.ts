/**
 * Snapshot Router - tRPC router for snapshot operations
 * Manages git-based snapshots for rollback functionality
 */

import { z } from "zod";
import { publicProcedure, router } from "@ClawDock/api";
import { TRPCError } from "@trpc/server";
import { db, snapshots } from "@ClawDock/db";
import { eq, desc } from "drizzle-orm";
import type { Snapshot } from "@ClawDock/db";

// ============================================================================
// Schemas
// ============================================================================

const SnapshotIdSchema = z.object({
  id: z.string().uuid(),
});

const SnapshotTypeEnum = z.enum(["auto", "manual", "pre-change"]);

const CreateSnapshotSchema = z.object({
  commitHash: z.string().min(1, "Commit hash is required"),
  snapshotType: SnapshotTypeEnum,
  triggerSource: z.string().optional(),
  comment: z.string().optional(),
  fileCount: z.number().int().min(0).default(0),
  sizeBytes: z.number().min(0).default(0),
  dbBackupPath: z.string().optional(),
});

// ============================================================================
// Router
// ============================================================================

export const snapshotRouter = router({
  /**
   * List all snapshots
   */
  list: publicProcedure.query(async (): Promise<Snapshot[]> => {
    const results = await db.query.snapshots.findMany({
      orderBy: [desc(snapshots.createdAt)],
    });

    return results;
  }),

  /**
   * Get a specific snapshot by ID
   */
  getById: publicProcedure
    .input(SnapshotIdSchema)
    .query(async ({ input }): Promise<Snapshot | null> => {
      const snapshot = await db.query.snapshots.findFirst({
        where: eq(snapshots.id, input.id),
      });

      return snapshot ?? null;
    }),

  /**
   * Create a new snapshot
   */
  create: publicProcedure
    .input(CreateSnapshotSchema)
    .mutation(async ({ input }): Promise<Snapshot> => {
      const [snapshot] = await db
        .insert(snapshots)
        .values({
          commitHash: input.commitHash,
          snapshotType: input.snapshotType,
          triggerSource: input.triggerSource,
          comment: input.comment,
          fileCount: input.fileCount,
          sizeBytes: input.sizeBytes,
          dbBackupPath: input.dbBackupPath,
        })
        .returning();

      if (!snapshot) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create snapshot",
        });
      }

      return snapshot;
    }),

  /**
   * Delete a snapshot by ID
   */
  delete: publicProcedure
    .input(SnapshotIdSchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      await db.delete(snapshots).where(eq(snapshots.id, input.id));
      return { success: true };
    }),
});

export type SnapshotRouter = typeof snapshotRouter;
