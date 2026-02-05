/**
 * Git Repository Manager
 *
 * Handles all git operations for the snapshot system using simple-git.
 * Provides functions for staging, committing, tagging, diffing, and more.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { SnapshotError, type DiffResult, type FileChangeStatus } from "./types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a simple-git instance for the given agent data path
 * @param agentDataPath - Path to the agent data directory
 * @returns SimpleGit instance
 */
function getGit(agentDataPath: string): SimpleGit {
  return simpleGit(agentDataPath);
}

/**
 * Wraps git operations with proper error handling
 * @param operation - The operation name for error context
 * @param fn - The async function to execute
 * @returns The result of the operation
 * @throws SnapshotError with GIT_ERROR code on failure
 */
async function withGitErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new SnapshotError(
      `Git operation failed: ${operation} - ${message}`,
      "GIT_ERROR",
      { operation, originalError: message },
    );
  }
}

/**
 * Maps git status to our FileChangeStatus type
 * @param status - Git status character
 * @returns Mapped FileChangeStatus
 */
function mapStatusToChangeStatus(status: string): FileChangeStatus {
  switch (status) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
    default:
      return "modified";
  }
}

// ============================================================================
// Git Repository Operations
// ============================================================================

/**
 * Ensures a git repository is initialized at the agent data path
 * @param agentDataPath - Path to the agent data directory
 * @throws SnapshotError if initialization fails
 */
export async function ensureGitRepo(agentDataPath: string): Promise<void> {
  const git = getGit(agentDataPath);

  await withGitErrorHandling("ensureGitRepo", async () => {
    // Check if repo is already initialized by trying to get status
    try {
      await git.status();
      // Status succeeded, repo exists
      return;
    } catch {
      // Repo doesn't exist, initialize it
      await git.init();

      // Configure git user (required for commits)
      await git.addConfig("user.email", "clawdock@local");
      await git.addConfig("user.name", "ClawDock");
    }
  });
}

/**
 * Stages all changes in the repository
 * @param agentDataPath - Path to the agent data directory
 * @throws SnapshotError if staging fails
 */
export async function stageAll(agentDataPath: string): Promise<void> {
  const git = getGit(agentDataPath);

  await withGitErrorHandling("stageAll", async () => {
    await git.add(".");
  });
}

/**
 * Creates a commit with the given message
 * @param agentDataPath - Path to the agent data directory
 * @param message - Commit message
 * @returns The commit hash
 * @throws SnapshotError if commit fails
 */
export async function commit(agentDataPath: string, message: string): Promise<string> {
  const git = getGit(agentDataPath);

  return await withGitErrorHandling("commit", async () => {
    const result = await git.commit(message);
    return result.commit;
  });
}

/**
 * Creates a lightweight tag at the specified commit
 * @param agentDataPath - Path to the agent data directory
 * @param tagName - Name of the tag to create
 * @param commitHash - Hash of the commit to tag
 * @throws SnapshotError if tagging fails
 */
export async function tag(
  agentDataPath: string,
  tagName: string,
  commitHash: string,
): Promise<void> {
  const git = getGit(agentDataPath);

  await withGitErrorHandling("tag", async () => {
    // Use raw command to tag a specific commit
    await git.raw(["tag", tagName, commitHash]);
  });
}

/**
 * Deletes a tag from the repository
 * @param agentDataPath - Path to the agent data directory
 * @param tagName - Name of the tag to delete
 * @throws SnapshotError if deletion fails
 */
export async function deleteTag(agentDataPath: string, tagName: string): Promise<void> {
  const git = getGit(agentDataPath);

  await withGitErrorHandling("deleteTag", async () => {
    await git.raw(["tag", "-d", tagName]);
  });
}

/**
 * Gets the diff between the specified commit and its parent
 * @param agentDataPath - Path to the agent data directory
 * @param commitHash - Hash of the commit to diff
 * @returns DiffResult with file changes and statistics
 * @throws SnapshotError if diff fails
 */
export async function getDiff(agentDataPath: string, commitHash: string): Promise<DiffResult> {
  const git = getGit(agentDataPath);

  return await withGitErrorHandling("getDiff", async () => {
    // Get diff summary for statistics
    const diffSummary = await git.diffSummary([`${commitHash}^`, commitHash]);

    // Parse the diff output to extract individual file diffs
    const files = await Promise.all(
      diffSummary.files.map(async (file) => {
        const status: FileChangeStatus = file.binary
          ? "modified"
          : mapStatusToChangeStatus((file as { status?: string }).status || "M");

        // Get the diff for this specific file
        const fileDiff = await git.diff([`${commitHash}^`, commitHash, "--", file.file]);

        return {
          path: file.file,
          status,
          diff: fileDiff || undefined,
        };
      }),
    );

    return {
      filesChanged: diffSummary.changed,
      additions: diffSummary.insertions,
      deletions: diffSummary.deletions,
      files,
    };
  });
}

/**
 * Checks out a specific commit
 * @param agentDataPath - Path to the agent data directory
 * @param commitHash - Hash of the commit to checkout
 * @throws SnapshotError if checkout fails
 */
export async function checkout(agentDataPath: string, commitHash: string): Promise<void> {
  const git = getGit(agentDataPath);

  await withGitErrorHandling("checkout", async () => {
    await git.checkout(commitHash);
  });
}

/**
 * Counts the number of changed files in the working directory
 * @param agentDataPath - Path to the agent data directory
 * @returns Number of changed files
 * @throws SnapshotError if status check fails
 */
export async function countChangedFiles(agentDataPath: string): Promise<number> {
  const git = getGit(agentDataPath);

  return await withGitErrorHandling("countChangedFiles", async () => {
    const status = await git.status();

    // Count all types of changes
    return (
      status.not_added.length +
      status.conflicted.length +
      status.created.length +
      status.deleted.length +
      status.modified.length +
      status.renamed.length +
      status.staged.length
    );
  });
}

/**
 * Calculates the repository size in bytes
 * Includes the .git directory and all tracked files
 * @param agentDataPath - Path to the agent data directory
 * @returns Size in bytes
 * @throws SnapshotError if size calculation fails
 */
export async function calculateRepoSize(agentDataPath: string): Promise<number> {
  return await withGitErrorHandling("calculateRepoSize", async () => {
    // Get the .git directory size
    const gitDir = join(agentDataPath, ".git");
    let gitSize = 0;

    try {
      const gitStat = await stat(gitDir);
      if (gitStat.isDirectory()) {
        gitSize = await calculateDirectorySize(gitDir);
      }
    } catch {
      // .git directory doesn't exist or isn't accessible
      gitSize = 0;
    }

    // Get the working directory size (excluding .git)
    const workingSize = await calculateDirectorySize(agentDataPath, ".git");

    return gitSize + workingSize;
  });
}

/**
 * Recursively calculates the size of a directory
 * @param dirPath - Path to the directory
 * @param excludeDir - Optional directory name to exclude
 * @returns Size in bytes
 */
async function calculateDirectorySize(
  dirPath: string,
  excludeDir?: string,
): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  let totalSize = 0;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Skip excluded directory
      if (excludeDir && entry.name === excludeDir) {
        continue;
      }

      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = await stat(fullPath);
          totalSize += stats.size;
        } catch {
          // File might have been deleted, skip
        }
      }
    }
  } catch {
    // Directory might not exist or isn't accessible
  }

  return totalSize;
}
