/**
 * Agent Files Module - File system operations for agent files
 * Handles reading, writing, and git operations for AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md
 */

import { readFile, writeFile, stat, access } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { env } from "@ClawDock/env/server";
import {
  AgentFileError,
  type AgentFileErrorCode,
  type AgentFileInfo,
  type AgentFileName,
  type FileCommit,
  type FileHistoryResult,
  type FileListResult,
  type FileReadResult,
  type FileRevertResult,
  type FileUpdateResult,
  isAgentFileName,
  isEditable,
} from './types';
import { createSnapshot, getSettings } from '../snapshot/service';
import { SnapshotError } from '../snapshot/types';

// Promisify execFile for async/await usage
const execFileAsync = promisify(execFile);

/**
 * Path to the agents directory
 * Based on AGENTS.md spec: data/{agentName}/agents/
 */
const AGENTS_DIR = env.AGENTS_DIR;

/**
 * Helper to create standardized errors
 */
function createAgentFileError(
  message: string,
  code: AgentFileErrorCode,
  filename?: string,
): AgentFileError {
  return new AgentFileError(message, code, filename);
}

/**
 * Validate filename and return normalized AgentFileName
 * @throws AgentFileError if filename is invalid
 */
function validateFilename(filename: string): AgentFileName {
  if (!isAgentFileName(filename)) {
    throw createAgentFileError(
      `Invalid filename: ${filename}. Must be one of: AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md`,
      'INVALID_FILENAME',
      filename,
    );
  }
  return filename;
}

/**
 * Get full file path for an agent file
 */
function getFilePath(filename: AgentFileName): string {
  return join(AGENTS_DIR, filename);
}

/**
 * Check if a file exists
 */
async function fileExists(filepath: string): Promise<boolean> {
  try {
    await access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read an agent file's content
 * @param filename - The agent file to read
 * @returns File content and editable status
 * @throws AgentFileError if file not found or read fails
 */
export async function readAgentFile(
  filename: string,
): Promise<FileReadResult> {
  const validFilename = validateFilename(filename);
  const filepath = getFilePath(validFilename);

  const exists = await fileExists(filepath);
  if (!exists) {
    throw createAgentFileError(
      `File not found: ${filename}`,
      'FILE_NOT_FOUND',
      filename,
    );
  }

  try {
    const content = await readFile(filepath, 'utf-8');
    return {
      content,
      editable: isEditable(validFilename),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createAgentFileError(
      `Failed to read file: ${errorMessage}`,
      'READ_ERROR',
      filename,
    );
  }
}

/**
 * Update (save) an agent file
 * @param filename - The agent file to update
 * @param content - New content for the file
 * @returns Success status
 * @throws AgentFileError if file not editable or write fails
 */
export async function updateAgentFile(
  filename: string,
  content: string,
): Promise<FileUpdateResult> {
  const validFilename = validateFilename(filename);

  if (!isEditable(validFilename)) {
    throw createAgentFileError(
      `File ${filename} is not editable. REFLECTION.md requires explicit unlock.`,
      'FILE_NOT_EDITABLE',
      filename,
    );
  }

  const filepath = getFilePath(validFilename);

  // Ensure the directory exists
  try {
    await access(AGENTS_DIR);
  } catch {
    throw createAgentFileError(
      `Agents directory not found: ${AGENTS_DIR}`,
      'FILE_NOT_FOUND',
      filename,
    );
  }

  // Check if pre-change snapshots are enabled
  try {
    const settings = await getSettings();

    if (settings.preChangeAgentFiles) {
      await createSnapshot({
        type: 'pre-change',
        trigger: 'agent-file-edit',
        comment: `Before editing ${filename}`,
        includeDatabase: false, // Files only, no need for DB
      });
    }
  } catch (error) {
    // Convert SnapshotError to AgentFileError to maintain contract
    if (error instanceof SnapshotError) {
      throw createAgentFileError(
        `Snapshot failed before file update: ${error.message}`,
        'WRITE_ERROR',
        filename,
      );
    }
    // Re-throw other errors as AgentFileError
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createAgentFileError(
      `Pre-change snapshot failed: ${errorMessage}`,
      'WRITE_ERROR',
      filename,
    );
  }

  try {
    await writeFile(filepath, content, 'utf-8');

    // Commit the change to git
    await commitFileChange(validFilename, `Update ${filename}`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createAgentFileError(
      `Failed to write file: ${errorMessage}`,
      'WRITE_ERROR',
      filename,
    );
  }
}

/**
 * Get information about a single agent file
 */
async function getAgentFileInfo(filename: AgentFileName): Promise<AgentFileInfo> {
  const filepath = getFilePath(filename);

  try {
    const stats = await stat(filepath);
    return {
      name: filename,
      editable: isEditable(filename),
      lastModified: stats.mtime,
      size: stats.size,
    };
  } catch {
    // File doesn't exist - return with size 0 and epoch date
    return {
      name: filename,
      editable: isEditable(filename),
      lastModified: new Date(0),
      size: 0,
    };
  }
}

/**
 * List all agent files with their metadata
 * @returns Array of file information for all agent files
 */
export async function listAgentFiles(): Promise<FileListResult> {
  const files: AgentFileInfo[] = await Promise.all([
    getAgentFileInfo('AGENTS.md'),
    getAgentFileInfo('SOUL.md'),
    getAgentFileInfo('GOALS.md'),
    getAgentFileInfo('REFLECTION.md'),
  ]);

  return { files };
}

/**
 * Parse git log output into FileCommit objects
 */
function parseGitLog(output: string): FileCommit[] {
  const lines = output.split('\n').filter((line: string) => line.trim() !== '');
  const commits: FileCommit[] = [];

  for (const line of lines) {
    // Parse format: hash|date|author|message
    const parts = line.split('|');
    if (parts.length >= 4) {
      const [hash, dateStr, author, ...messageParts] = parts;
      const date = new Date(dateStr ?? 0);
      const message = messageParts.join('|'); // Rejoin in case message had |

      commits.push({
        hash: hash ?? '',
        message,
        date,
        author: author ?? 'Unknown',
      });
    }
  }

  return commits;
}

/**
 * Get commit history for a specific agent file
 * @param filename - The agent file to get history for
 * @param limit - Maximum number of commits to return (default: 50)
 * @returns Array of commits
 * @throws AgentFileError if git operation fails
 */
export async function getFileHistory(
  filename: string,
  limit = 50,
): Promise<FileHistoryResult> {
  const validFilename = validateFilename(filename);
  const filepath = getFilePath(validFilename);

  try {
    // Format: hash|date|author|subject
    const format = '%H|%ai|%an|%s';
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        '--follow',
        `--max-count=${limit}`,
        `--format=${format}`,
        '--',
        filepath,
      ],
      { cwd: process.cwd() },
    );

    const commits = parseGitLog(stdout);

    return { commits };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createAgentFileError(
      `Failed to get file history: ${errorMessage}`,
      'GIT_ERROR',
      filename,
    );
  }
}

/**
 * Commit a file change to git
 * @param filename - The agent file that was changed
 * @param message - Commit message
 * @throws AgentFileError if git operation fails
 */
async function commitFileChange(
  filename: AgentFileName,
  message: string,
): Promise<void> {
  const filepath = getFilePath(filename);

  try {
    // Add the file
    await execFileAsync('git', ['add', filepath], { cwd: process.cwd() });

    // Commit with message
    await execFileAsync(
      'git',
      ['commit', '-m', message, '--', filepath],
      { cwd: process.cwd() },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createAgentFileError(
      `Failed to commit file change: ${errorMessage}`,
      'GIT_ERROR',
      filename,
    );
  }
}

/**
 * Revert a file to a specific commit
 * @param filename - The agent file to revert
 * @param commitHash - The commit hash to revert to
 * @returns Success status
 * @throws AgentFileError if git operation fails or file not editable
 */
export async function revertAgentFile(
  filename: string,
  commitHash: string,
): Promise<FileRevertResult> {
  const validFilename = validateFilename(filename);

  if (!isEditable(validFilename)) {
    throw createAgentFileError(
      `File ${filename} is not editable. Cannot revert read-only files.`,
      'FILE_NOT_EDITABLE',
      filename,
    );
  }

  const filepath = getFilePath(validFilename);

  try {
    // Checkout the specific file from the commit
    await execFileAsync(
      'git',
      ['checkout', commitHash, '--', filepath],
      { cwd: process.cwd() },
    );

    // Commit the revert
    await commitFileChange(validFilename, `Revert ${filename} to ${commitHash.slice(0, 7)}`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createAgentFileError(
      `Failed to revert file: ${errorMessage}`,
      'GIT_ERROR',
      filename,
    );
  }
}
