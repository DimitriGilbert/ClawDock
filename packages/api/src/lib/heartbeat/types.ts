/**
 * Heartbeat Daemon Types
 *
 * Type definitions for the polling daemon that monitors bays
 * (email, RSS, chat, etc.) and creates tasks based on triggers.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Time intervals as strings like "60s", "5m", "1h"
 * Parsed by parseInterval() in config.ts
 */
export type TimeInterval = string;

/**
 * Types of trigger conditions for matching incoming items
 */
export type TriggerType = 'keyword' | 'sender' | 'pattern' | 'all';

/**
 * Actions to take when a trigger matches
 */
export type TriggerAction = 'create_task' | 'notify' | 'ignore';

/**
 * Condition that determines when to trigger an action on incoming items
 */
export interface TriggerCondition {
  /** Type of matching to perform */
  type: TriggerType;
  /** The keyword/sender/pattern to match (not required for 'all' type) */
  value?: string;
  /** Action to take when condition matches */
  action: TriggerAction;
  /** Task priority if action is create_task (0-100, higher is more urgent) */
  priority?: number;
}

/**
 * Configuration for a single bay (data source)
 */
export interface BayConfig {
  /** How often to check this bay for new items */
  checkInterval: TimeInterval;
  /** Whether this bay is enabled for polling */
  enabled: boolean;
  /** List of trigger conditions to evaluate on incoming items */
  triggers: TriggerCondition[];
}

/**
 * Root configuration structure for the heartbeat daemon
 */
export interface HeartbeatConfig {
  /** Default polling interval for all bays */
  interval: TimeInterval;
  /** Per-bay configuration keyed by bay name */
  bays: Record<string, BayConfig>;
}

// ============================================================================
// Runtime Types
// ============================================================================

/**
 * Result from a single poll of a bay
 */
export interface HeartbeatResult {
  /** Name of the bay that was polled */
  bayName: string;
  /** When the poll occurred */
  timestamp: Date;
  /** Number of new items found */
  itemsFound: number;
  /** Number of tasks created from triggers */
  tasksCreated: number;
  /** Any errors encountered during polling */
  errors: string[];
}

/**
 * Current runtime status of the heartbeat daemon
 */
export interface HeartbeatStatus {
  /** Whether the daemon is currently running */
  running: boolean;
  /** When the daemon was started (null if never started) */
  startedAt: Date | null;
  /** When the last poll occurred (null if no polls yet) */
  lastPollAt: Date | null;
  /** Total number of polls performed since start */
  totalPolls: number;
  /** Results from recent polls */
  results: HeartbeatResult[];
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes specific to heartbeat operations
 */
export type HeartbeatErrorCode =
  | 'CONFIG_LOAD_FAILED'
  | 'BAY_NOT_FOUND'
  | 'POLL_FAILED'
  | 'TRIGGER_FAILED'
  | 'ALREADY_RUNNING'
  | 'NOT_RUNNING';

/**
 * Custom error class for heartbeat operations
 * Provides structured error information for better handling
 */
export class HeartbeatError extends Error {
  constructor(
    message: string,
    public code: HeartbeatErrorCode,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HeartbeatError';
  }
}
