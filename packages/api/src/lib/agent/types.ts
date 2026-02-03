/**
 * Type definitions for Agent Files Module
 * Defines the core types for agent file operations
 */

/**
 * Valid agent file names in the system
 * AGENTS.md, SOUL.md, GOALS.md are editable
 * REFLECTION.md is read-only by default
 */
export type AgentFileName = 'AGENTS.md' | 'SOUL.md' | 'GOALS.md' | 'REFLECTION.md';

/**
 * Array of all valid agent file names
 */
export const AGENT_FILE_NAMES: readonly AgentFileName[] = [
  'AGENTS.md',
  'SOUL.md',
  'GOALS.md',
  'REFLECTION.md',
];

/**
 * Set of editable agent files
 * REFLECTION.md requires explicit unlock to edit
 */
export const EDITABLE_FILES: ReadonlySet<AgentFileName> = new Set([
  'AGENTS.md',
  'SOUL.md',
  'GOALS.md',
]);

/**
 * Information about an agent file
 */
export type AgentFileInfo = {
  name: AgentFileName;
  editable: boolean;
  lastModified: Date;
  size: number;
};

/**
 * Result of reading a file
 */
export type FileReadResult = {
  content: string;
  editable: boolean;
};

/**
 * Result of updating a file
 */
export type FileUpdateResult = {
  success: boolean;
};

/**
 * Git commit information for file history
 */
export type FileCommit = {
  hash: string;
  message: string;
  date: Date;
  author: string;
};

/**
 * Result of getting file history
 */
export type FileHistoryResult = {
  commits: FileCommit[];
};

/**
 * Result of reverting a file
 */
export type FileRevertResult = {
  success: boolean;
};

/**
 * Result of listing agent files
 */
export type FileListResult = {
  files: AgentFileInfo[];
};

/**
 * Error codes for agent file operations
 */
export type AgentFileErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_EDITABLE'
  | 'READ_ERROR'
  | 'WRITE_ERROR'
  | 'GIT_ERROR'
  | 'INVALID_FILENAME';

/**
 * Custom error class for agent file operations
 */
export class AgentFileError extends Error {
  constructor(
    message: string,
    public readonly code: AgentFileErrorCode,
    public readonly filename?: string,
  ) {
    super(message);
    this.name = 'AgentFileError';
  }
}

/**
 * Type guard to check if a string is a valid AgentFileName
 */
export function isAgentFileName(filename: string): filename is AgentFileName {
  return AGENT_FILE_NAMES.includes(filename as AgentFileName);
}

/**
 * Check if a file is editable
 */
export function isEditable(filename: AgentFileName): boolean {
  return EDITABLE_FILES.has(filename);
}
