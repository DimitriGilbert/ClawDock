/**
 * Core Snapshot Service
 *
 * The main service that ties together all snapshot operations:
 * - Git operations (commit, tag, checkout)
 * - Database backups (pg_dump, restore)
 * - Manifest management (JSON registry)
 *
 * Provides high-level functions for creating, restoring, and managing snapshots.
 */

import { randomUUID } from "node:crypto";
import { env } from "@ClawDock/env/server";
import { db, snapshotSettings, eq } from "@ClawDock/db";
import type {
  Snapshot,
  SnapshotSettings,
  CreateSnapshotOptions,
  RestoreOptions,
  DiffResult,
  SnapshotEntry,
} from "./types";
import { SnapshotError } from "./types";
import {
  ensureGitRepo,
  stageAll,
  commit,
  tag,
  deleteTag,
  getDiff,
  checkout,
  countChangedFiles,
  calculateRepoSize,
} from "./git";
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  deleteDatabaseBackup,
} from "./database";
import {
  readManifest,
  writeManifest,
  addSnapshot,
  removeSnapshot,
  getSnapshot,
} from "./manifest";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the agent data path from environment
 * @returns The configured agent data path
 */
function getAgentDataPathInternal(): string {
  return env.AGENT_DATA_PATH;
}

/**
 * Converts a SnapshotEntry (from manifest) to a Snapshot (for API)
 * @param entry - The snapshot entry from the manifest
 * @returns Snapshot object with Date instead of string timestamp
 */
function entryToSnapshot(entry: SnapshotEntry): Snapshot {
  return {
    id: entry.id,
    commitHash: entry.commitHash,
    timestamp: new Date(entry.timestamp),
    type: entry.type,
    trigger: entry.trigger,
    comment: entry.comment,
    fileCount: entry.fileCount,
    sizeBytes: entry.sizeBytes,
    dbBackupPath: entry.dbBackupPath,
  };
}

/**
 * Converts a Snapshot (from API) to a SnapshotEntry (for manifest)
 * @param snapshot - The snapshot object
 * @returns SnapshotEntry with ISO string timestamp
 */
function snapshotToEntry(snapshot: Snapshot): SnapshotEntry {
  return {
    id: snapshot.id,
    commitHash: snapshot.commitHash,
    timestamp: snapshot.timestamp.toISOString(),
    type: snapshot.type,
    trigger: snapshot.trigger,
    comment: snapshot.comment,
    fileCount: snapshot.fileCount,
    sizeBytes: snapshot.sizeBytes,
    dbBackupPath: snapshot.dbBackupPath,
  };
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Creates a new snapshot of the current system state
 *
 * Flow:
 * 1. Validate prerequisites (git repo initialized)
 * 2. Optionally backup database
 * 3. Stage all changes in git
 * 4. Create commit with message: `[type] comment`
 * 5. Create git tag: `snapshot-{id}`
 * 6. Calculate file count and size
 * 7. Add entry to manifest
 * 8. Return snapshot object
 *
 * @param options - Options for creating the snapshot
 * @returns The created snapshot
 * @throws SnapshotError if creation fails
 */
export async function createSnapshot(options: CreateSnapshotOptions): Promise<Snapshot> {
  const agentDataPath = getAgentDataPathInternal();
  const snapshotId = randomUUID();

  try {
    // Step 1: Ensure git repo is initialized
    await ensureGitRepo(agentDataPath);

    // Step 2: Optionally backup database
    let dbBackupPath: string | undefined;
    if (options.includeDatabase !== false) {
      try {
        dbBackupPath = await createDatabaseBackup(snapshotId, agentDataPath);
      } catch (error) {
        // Log warning but continue without database backup
        console.warn(
          `Warning: Database backup failed for snapshot ${snapshotId}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
        // Continue without database backup
      }
    }

    // Step 3: Stage all changes
    await stageAll(agentDataPath);

    // Step 4: Create commit with formatted message
    const comment = options.comment || "Snapshot";
    const commitMessage = `[${options.type}] ${comment}`;
    const commitHash = await commit(agentDataPath, commitMessage);

    // Step 5: Create git tag
    const tagName = `snapshot-${snapshotId}`;
    await tag(agentDataPath, tagName, commitHash);

    // Step 6: Calculate file count and size
    const fileCount = await countChangedFiles(agentDataPath);
    const sizeBytes = await calculateRepoSize(agentDataPath);

    // Step 7: Create snapshot entry and add to manifest
    const snapshot: Snapshot = {
      id: snapshotId,
      commitHash,
      timestamp: new Date(),
      type: options.type,
      trigger: options.trigger,
      comment,
      fileCount,
      sizeBytes,
      dbBackupPath,
    };

    const entry = snapshotToEntry(snapshot);
    await addSnapshot(agentDataPath, entry);

    return snapshot;
  } catch (error) {
    // Cleanup on failure: delete any created resources
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to create snapshot: ${errorMessage}`,
      "GIT_ERROR",
      { snapshotId, options, error: errorMessage }
    );
  }
}

/**
 * Restores the system to a specific snapshot
 *
 * Flow:
 * 1. Validate snapshot exists
 * 2. Create pre-restore snapshot (safety net)
 * 3. Checkout the snapshot commit
 * 4. Optionally restore database
 * 5. Return success
 *
 * @param snapshotId - The ID of the snapshot to restore
 * @param options - Optional restore settings
 * @throws SnapshotError if restoration fails
 */
export async function restoreSnapshot(
  snapshotId: string,
  options?: RestoreOptions
): Promise<void> {
  const agentDataPath = getAgentDataPathInternal();

  try {
    // Step 1: Validate snapshot exists
    const entry = await getSnapshot(agentDataPath, snapshotId);
    if (!entry) {
      throw new SnapshotError(
        `Snapshot with ID '${snapshotId}' not found`,
        "NOT_FOUND",
        { snapshotId }
      );
    }

    // Step 2: Create pre-restore snapshot as safety net
    let preRestoreSnapshot: Snapshot | undefined;
    try {
      preRestoreSnapshot = await createSnapshot({
        type: "pre-change",
        trigger: "pre-restore",
        comment: `Auto-snapshot before restoring to ${snapshotId}`,
        includeDatabase: true, // Always include DB for safety net
      });
    } catch (error) {
      // Log but don't fail - restoration should still proceed
      console.warn(
        "Warning: Failed to create pre-restore safety snapshot:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    // Step 3: Checkout the snapshot commit
    await checkout(agentDataPath, entry.commitHash);

    // Step 4: Optionally restore database
    if (options?.includeDatabase !== false && entry.dbBackupPath) {
      try {
        await restoreDatabaseBackup(entry.dbBackupPath);
      } catch (error) {
        // If DB restore fails, we should try to roll back to pre-restore snapshot
        if (preRestoreSnapshot) {
          console.warn("Database restore failed, attempting rollback...");
          try {
            await checkout(agentDataPath, preRestoreSnapshot.commitHash);
            if (preRestoreSnapshot.dbBackupPath) {
              await restoreDatabaseBackup(preRestoreSnapshot.dbBackupPath);
            }
          } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
          }
        }
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to restore snapshot: ${errorMessage}`,
      "GIT_ERROR",
      { snapshotId, error: errorMessage }
    );
  }
}

/**
 * Deletes a snapshot and its associated resources
 *
 * Removes the snapshot from the manifest, deletes the git tag,
 * and removes the database backup file if it exists.
 *
 * @param snapshotId - The ID of the snapshot to delete
 * @throws SnapshotError if deletion fails
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const agentDataPath = getAgentDataPathInternal();

  try {
    // Get the snapshot entry first
    const entry = await getSnapshot(agentDataPath, snapshotId);
    if (!entry) {
      throw new SnapshotError(
        `Snapshot with ID '${snapshotId}' not found`,
        "NOT_FOUND",
        { snapshotId }
      );
    }

    // Remove from manifest first
    await removeSnapshot(agentDataPath, snapshotId);

    // Delete the git tag
    const tagName = `snapshot-${snapshotId}`;
    try {
      await deleteTag(agentDataPath, tagName);
    } catch (error) {
      // Log but don't fail - tag might not exist
      console.warn(
        `Warning: Failed to delete tag ${tagName}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    // Delete database backup if it exists
    if (entry.dbBackupPath) {
      try {
        await deleteDatabaseBackup(entry.dbBackupPath);
      } catch (error) {
        // Log but don't fail - backup might not exist
        console.warn(
          `Warning: Failed to delete database backup for ${snapshotId}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to delete snapshot: ${errorMessage}`,
      "GIT_ERROR",
      { snapshotId, error: errorMessage }
    );
  }
}

/**
 * Lists all snapshots sorted by timestamp (newest first)
 *
 * @returns Array of snapshots
 * @throws SnapshotError if reading manifest fails
 */
export async function listSnapshots(): Promise<Snapshot[]> {
  const agentDataPath = getAgentDataPathInternal();

  try {
    const manifest = await readManifest(agentDataPath);
    return manifest.snapshots
      .map(entryToSnapshot)
      .sort((a, b) => {
        const timeA = a.timestamp.getTime();
        const timeB = b.timestamp.getTime();
        // Handle invalid timestamps by treating them as older (sort to the end)
        if (Number.isNaN(timeA)) return 1;
        if (Number.isNaN(timeB)) return -1;
        return timeB - timeA;
      });
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to list snapshots: ${errorMessage}`,
      "GIT_ERROR",
      { error: errorMessage }
    );
  }
}

/**
 * Gets a specific snapshot by ID
 *
 * @param snapshotId - The ID of the snapshot to retrieve
 * @returns The snapshot or null if not found
 * @throws SnapshotError if reading fails
 */
export async function getSnapshotById(snapshotId: string): Promise<Snapshot | null> {
  const agentDataPath = getAgentDataPathInternal();

  try {
    const entry = await getSnapshot(agentDataPath, snapshotId);
    return entry ? entryToSnapshot(entry) : null;
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to get snapshot: ${errorMessage}`,
      "GIT_ERROR",
      { snapshotId, error: errorMessage }
    );
  }
}

/**
 * Gets the diff for a specific snapshot
 *
 * Shows the changes introduced by the snapshot commit.
 *
 * @param snapshotId - The ID of the snapshot to diff
 * @returns Diff result with file changes and statistics
 * @throws SnapshotError if snapshot not found or diff fails
 */
export async function getSnapshotDiff(snapshotId: string): Promise<DiffResult> {
  const agentDataPath = getAgentDataPathInternal();

  try {
    // Get the snapshot entry
    const entry = await getSnapshot(agentDataPath, snapshotId);
    if (!entry) {
      throw new SnapshotError(
        `Snapshot with ID '${snapshotId}' not found`,
        "NOT_FOUND",
        { snapshotId }
      );
    }

    // Get the diff for the commit
    return await getDiff(agentDataPath, entry.commitHash);
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to get snapshot diff: ${errorMessage}`,
      "GIT_ERROR",
      { snapshotId, error: errorMessage }
    );
  }
}

/**
 * Prunes old snapshots, keeping only the specified number of most recent ones
 *
 * @param keepLast - Number of snapshots to keep (must be >= 1)
 * @returns Number of snapshots deleted
 * @throws SnapshotError if pruning fails
 */
export async function pruneSnapshots(keepLast: number): Promise<number> {
  const agentDataPath = getAgentDataPathInternal();

  if (keepLast < 1) {
    throw new SnapshotError(
      "keepLast must be at least 1",
      "VALIDATION_ERROR",
      { keepLast }
    );
  }

  try {
    const manifest = await readManifest(agentDataPath);

    // Sort by timestamp (newest first)
    const sortedSnapshots = [...manifest.snapshots].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Determine which snapshots to delete
    const toDelete = sortedSnapshots.slice(keepLast);

    if (toDelete.length === 0) {
      return 0;
    }

    // Delete each snapshot
    let deletedCount = 0;
    for (const entry of toDelete) {
      try {
        await deleteSnapshot(entry.id);
        deletedCount++;
      } catch (error) {
        // Log but continue with other deletions
        console.warn(
          `Warning: Failed to delete snapshot ${entry.id}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    // Update manifest with prune timestamp
    const updatedManifest = await readManifest(agentDataPath);
    updatedManifest.lastPrunedAt = new Date().toISOString();
    await writeManifest(agentDataPath, updatedManifest);

    return deletedCount;
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to prune snapshots: ${errorMessage}`,
      "GIT_ERROR",
      { keepLast, error: errorMessage }
    );
  }
}

// ============================================================================
// Settings Operations
// ============================================================================

/**
 * Singleton ID for snapshot settings (fixed UUID ensures only one row exists)
 */
export const SNAPSHOT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Gets the current snapshot settings from the database
 *
 * If no settings exist, creates default settings atomically using upsert.
 *
 * @returns Current snapshot settings
 * @throws SnapshotError if database operation fails
 */
export async function getSettings(): Promise<SnapshotSettings> {
  try {
    const now = new Date();

    // Atomic upsert: insert or ignore on conflict (prevents duplicate rows under concurrent requests)
    await db
      .insert(snapshotSettings)
      .values({
        id: SNAPSHOT_SETTINGS_ID,
        maxSnapshots: env.SNAPSHOT_RETENTION_COUNT,
        preChangeCompose: true,
        preChangeAgentFiles: true,
        includeDatabase: true,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: snapshotSettings.id });

    // Retrieve the settings (either newly inserted or existing)
    const settings = await db.query.snapshotSettings.findFirst();

    if (!settings) {
      throw new SnapshotError(
        "Failed to create or retrieve settings",
        "DB_ERROR",
        {}
      );
    }

    return settings;
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to get settings: ${errorMessage}`,
      "DB_ERROR",
      { error: errorMessage }
    );
  }
}

/**
 * Updates the snapshot settings
 *
 * @param settings - Partial settings object with values to update
 * @returns Updated snapshot settings
 * @throws SnapshotError if update fails
 */
export async function updateSettings(
  settings: Partial<Omit<SnapshotSettings, "id" | "updatedAt">>
): Promise<SnapshotSettings> {
  try {
    // Get current settings to find the ID
    const currentSettings = await getSettings();

    // Build update values
    const updateValues: Partial<typeof snapshotSettings.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (settings.maxSnapshots !== undefined) {
      updateValues.maxSnapshots = settings.maxSnapshots;
    }
    if (settings.preChangeCompose !== undefined) {
      updateValues.preChangeCompose = settings.preChangeCompose;
    }
    if (settings.preChangeAgentFiles !== undefined) {
      updateValues.preChangeAgentFiles = settings.preChangeAgentFiles;
    }
    if (settings.includeDatabase !== undefined) {
      updateValues.includeDatabase = settings.includeDatabase;
    }

    // Update settings
    const [updated] = await db
      .update(snapshotSettings)
      .set(updateValues)
      .where(eq(snapshotSettings.id, currentSettings.id))
      .returning();

    if (!updated) {
      throw new SnapshotError(
        "Failed to update settings - settings not found",
        "NOT_FOUND",
        { settingsId: currentSettings.id }
      );
    }

    return updated;
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to update settings: ${errorMessage}`,
      "DB_ERROR",
      { settings, error: errorMessage }
    );
  }
}
