/**
 * Snapshot System Types
 * 
 * Type definitions for the git-based snapshot system that provides
 * rollback capabilities and change tracking for ClawDock.
 */

// ============================================================================
// Core Snapshot Types
// ============================================================================

/**
 * Represents a complete snapshot of the system state
 * Maps to the database snapshots table
 */
export interface Snapshot {
  id: string;
  commitHash: string;
  timestamp: Date;
  type: 'manual' | 'pre-change' | 'auto';
  trigger?: string;
  comment: string;
  fileCount: number;
  sizeBytes: number;
  dbBackupPath?: string;
}

/**
 * Snapshot system configuration settings
 * Maps to the database snapshot_settings table
 */
export interface SnapshotSettings {
  id: string;
  maxSnapshots: number;
  preChangeCompose: boolean;
  preChangeAgentFiles: boolean;
  includeDatabase: boolean;
  updatedAt: Date;
}

// ============================================================================
// Diff and Comparison Types
// ============================================================================

/**
 * Result of comparing two snapshots or a snapshot with working directory
 */
export interface DiffResult {
  filesChanged: number;
  additions: number;
  deletions: number;
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    diff?: string;
  }>;
}

/**
 * Individual file diff information from git
 */
export interface GitDiffResult {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    diff?: string;
  }>;
  additions: number;
  deletions: number;
}

// ============================================================================
// Manifest Types (for snapshot.json)
// ============================================================================

/**
 * Entry in the snapshot manifest file
 * Uses ISO strings for JSON serialization
 */
export interface SnapshotEntry {
  id: string;
  commitHash: string;
  timestamp: string;
  type: 'manual' | 'pre-change' | 'auto';
  trigger?: string;
  comment: string;
  fileCount: number;
  sizeBytes: number;
  dbBackupPath?: string;
}

/**
 * Root manifest structure for snapshot.json
 * Stored in the snapshots directory for quick metadata access
 */
export interface SnapshotManifest {
  version: '1.0';
  snapshots: SnapshotEntry[];
  lastPrunedAt?: string;
}

// ============================================================================
// Operation Options
// ============================================================================

/**
 * Options for creating a new snapshot
 */
export interface CreateSnapshotOptions {
  type: 'manual' | 'pre-change';
  trigger?: string;
  comment?: string;
  includeDatabase?: boolean;
}

/**
 * Options for restoring from a snapshot
 */
export interface RestoreOptions {
  includeDatabase?: boolean;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes specific to snapshot operations
 */
export type SnapshotErrorCode = 'GIT_ERROR' | 'DB_ERROR' | 'NOT_FOUND' | 'VALIDATION_ERROR';

/**
 * Custom error class for snapshot operations
 * Provides structured error information for better handling
 */
export class SnapshotError extends Error {
  constructor(
    message: string,
    public code: SnapshotErrorCode,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Valid snapshot types
 */
export type SnapshotType = 'manual' | 'pre-change' | 'auto';

/**
 * File change status from git
 */
export type FileChangeStatus = 'added' | 'modified' | 'deleted';

/**
 * Metadata for file entries in diffs
 */
export interface FileDiffEntry {
  path: string;
  status: FileChangeStatus;
  diff?: string;
}
