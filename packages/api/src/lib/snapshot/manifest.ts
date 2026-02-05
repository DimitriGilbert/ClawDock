/**
 * Manifest Manager
 *
 * Handles reading, writing, and manipulating the snapshot manifest file.
 * The manifest serves as the registry for all snapshots, stored in JSON format.
 *
 * File Location: data/{AgentName}/.snapshots/manifest.json
 */

import { readFile, writeFile, access } from "node:fs/promises";
import type {
  SnapshotManifest,
  SnapshotEntry,
} from "./types";
import { SnapshotError } from "./types";
import { getManifestPath } from "./setup";

/**
 * Default manifest structure when no manifest exists yet
 */
const DEFAULT_MANIFEST: SnapshotManifest = {
  version: "1.0",
  snapshots: [],
};

/**
 * Reads the manifest file from disk
 * Returns default manifest if file doesn't exist
 *
 * @param agentDataPath - Path to the agent data directory
 * @returns The parsed manifest or default if not found
 * @throws SnapshotError if file exists but cannot be read or parsed
 */
export async function readManifest(
  agentDataPath: string
): Promise<SnapshotManifest> {
  const manifestPath = getManifestPath(agentDataPath);

  try {
    // Check if manifest exists
    await access(manifestPath);
  } catch {
    // Manifest doesn't exist, return default
    return { ...DEFAULT_MANIFEST };
  }

  try {
    // Read and parse the manifest
    const content = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    // Validate the parsed structure has required fields
    if (!isValidManifest(parsed)) {
      throw new SnapshotError(
        "Invalid manifest structure",
        "VALIDATION_ERROR",
        { path: manifestPath }
      );
    }

    return parsed;
  } catch (error) {
    // If it's already a SnapshotError, rethrow it
    if (error instanceof SnapshotError) {
      throw error;
    }

    // Handle JSON parse errors or file read errors
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to read manifest: ${errorMessage}`,
      "GIT_ERROR",
      { path: manifestPath, originalError: errorMessage }
    );
  }
}

/**
 * Writes the manifest file to disk
 * Creates parent directories if needed
 *
 * @param agentDataPath - Path to the agent data directory
 * @param manifest - The manifest to write
 * @throws SnapshotError if write fails
 */
export async function writeManifest(
  agentDataPath: string,
  manifest: SnapshotManifest
): Promise<void> {
  const manifestPath = getManifestPath(agentDataPath);

  try {
    // Validate manifest structure before writing
    if (!isValidManifest(manifest)) {
      throw new SnapshotError(
        "Cannot write invalid manifest structure",
        "VALIDATION_ERROR",
        { path: manifestPath }
      );
    }

    // Serialize with pretty printing for readability
    const content = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, content, "utf-8");
  } catch (error) {
    // If it's already a SnapshotError, rethrow it
    if (error instanceof SnapshotError) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Failed to write manifest: ${errorMessage}`,
      "GIT_ERROR",
      { path: manifestPath, originalError: errorMessage }
    );
  }
}

/**
 * Adds a new snapshot entry to the manifest
 * Entries are appended to the snapshots array
 *
 * @param agentDataPath - Path to the agent data directory
 * @param entry - The snapshot entry to add
 * @throws SnapshotError if read/write fails or entry is invalid
 */
export async function addSnapshot(
  agentDataPath: string,
  entry: SnapshotEntry
): Promise<void> {
  // Validate entry has required fields
  if (!isValidSnapshotEntry(entry)) {
    throw new SnapshotError(
      "Invalid snapshot entry",
      "VALIDATION_ERROR",
      { entry }
    );
  }

  // Read current manifest
  const manifest = await readManifest(agentDataPath);

  // Check for duplicate ID
  const existingIndex = manifest.snapshots.findIndex(
    (s) => s.id === entry.id
  );
  if (existingIndex !== -1) {
    throw new SnapshotError(
      `Snapshot with ID '${entry.id}' already exists`,
      "VALIDATION_ERROR",
      { snapshotId: entry.id }
    );
  }

  // Add new entry
  manifest.snapshots.push(entry);

  // Sort by timestamp (newest first) for consistency
  manifest.snapshots.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Write updated manifest
  await writeManifest(agentDataPath, manifest);
}

/**
 * Removes a snapshot entry from the manifest by ID
 * Does not delete associated files (handled by service layer)
 *
 * @param agentDataPath - Path to the agent data directory
 * @param snapshotId - The ID of the snapshot to remove
 * @throws SnapshotError if snapshot not found or write fails
 */
export async function removeSnapshot(
  agentDataPath: string,
  snapshotId: string
): Promise<void> {
  // Read current manifest
  const manifest = await readManifest(agentDataPath);

  // Find the snapshot
  const index = manifest.snapshots.findIndex((s) => s.id === snapshotId);
  if (index === -1) {
    throw new SnapshotError(
      `Snapshot with ID '${snapshotId}' not found`,
      "NOT_FOUND",
      { snapshotId }
    );
  }

  // Remove the entry
  manifest.snapshots.splice(index, 1);

  // Write updated manifest
  await writeManifest(agentDataPath, manifest);
}

/**
 * Retrieves a single snapshot entry by ID
 *
 * @param agentDataPath - Path to the agent data directory
 * @param snapshotId - The ID of the snapshot to retrieve
 * @returns The snapshot entry or null if not found
 * @throws SnapshotError if read fails
 */
export async function getSnapshot(
  agentDataPath: string,
  snapshotId: string
): Promise<SnapshotEntry | null> {
  // Read current manifest
  const manifest = await readManifest(agentDataPath);

  // Find and return the snapshot
  const entry = manifest.snapshots.find((s) => s.id === snapshotId);
  return entry ?? null;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Type guard to validate an unknown value is a valid SnapshotManifest
 */
function isValidManifest(value: unknown): value is SnapshotManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const manifest = value as Record<string, unknown>;

  // Check version
  if (manifest.version !== "1.0") {
    return false;
  }

  // Check snapshots array exists
  if (!Array.isArray(manifest.snapshots)) {
    return false;
  }

  // Validate each snapshot entry
  return manifest.snapshots.every((entry) => isValidSnapshotEntry(entry));
}

/**
 * Type guard to validate an unknown value is a valid SnapshotEntry
 */
function isValidSnapshotEntry(value: unknown): value is SnapshotEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  // Required fields
  if (typeof entry.id !== "string" || entry.id.length === 0) {
    return false;
  }

  if (typeof entry.commitHash !== "string" || entry.commitHash.length === 0) {
    return false;
  }

  if (typeof entry.timestamp !== "string") {
    return false;
  }

  // Validate timestamp is parseable
  if (Number.isNaN(Date.parse(entry.timestamp))) {
    return false;
  }

  // Type must be one of allowed values
  const validTypes: string[] = ["manual", "pre-change", "auto"];
  if (typeof entry.type !== "string" || !validTypes.includes(entry.type)) {
    return false;
  }

  if (typeof entry.comment !== "string") {
    return false;
  }

  if (typeof entry.fileCount !== "number" || entry.fileCount < 0) {
    return false;
  }

  if (typeof entry.sizeBytes !== "number" || entry.sizeBytes < 0) {
    return false;
  }

  // Optional fields validation
  if (entry.trigger !== undefined && typeof entry.trigger !== "string") {
    return false;
  }

  if (
    entry.dbBackupPath !== undefined &&
    typeof entry.dbBackupPath !== "string"
  ) {
    return false;
  }

  return true;
}
