/**
 * Heartbeat Daemon Service
 *
 * Polling daemon that monitors bays (email, RSS, chat, etc.) and creates
 * tasks based on configurable triggers. Uses pure programmatic evaluation
 * (NO AI calls) during bay checks.
 */

import { loadConfig, parseInterval } from './config';
import type {
  HeartbeatConfig,
  HeartbeatStatus,
  HeartbeatResult,
  TriggerCondition,
  BayConfig,
} from './types';
import { HeartbeatError } from './types';
import { createTask } from '../task/service';

// ============================================================================
// Bay Item Types
// ============================================================================

/**
 * Item found during bay check
 * Represents a single item (message, email, RSS entry, etc.) from a bay
 */
interface BayItem {
  /** Unique identifier for this item */
  id: string;
  /** Main content of the item */
  content: string;
  /** Source identifier (sender, feed URL, etc.) */
  source: string;
  /** Additional metadata specific to the bay type */
  metadata: Record<string, unknown>;
}

// ============================================================================
// HeartbeatDaemon Class
// ============================================================================

/**
 * Daemon that polls bays and creates tasks based on triggers
 *
 * @example
 * ```typescript
 * const daemon = getHeartbeatDaemon();
 * await daemon.start();
 * // ... daemon polls in background ...
 * await daemon.stop();
 * ```
 */
export class HeartbeatDaemon {
  private config: HeartbeatConfig | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private isPolling = false;
  private status: HeartbeatStatus = {
    running: false,
    startedAt: null,
    lastPollAt: null,
    totalPolls: 0,
    results: [],
  };

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Starts the heartbeat daemon
   *
   * Loads configuration, performs initial poll, then schedules recurring polls.
   * Safe to call multiple times - will no-op if already running.
   *
   * @throws HeartbeatError if configuration loading fails
   */
  async start(): Promise<void> {
    if (this.status.running) {
      console.log('[Heartbeat] Already running, ignoring start request');
      return;
    }

    try {
      this.config = await loadConfig();
    } catch (error) {
      throw new HeartbeatError(
        `Failed to load heartbeat configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONFIG_LOAD_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    const intervalMs = parseInterval(this.config.interval);

    // Initialize status before first poll so first poll's bookkeeping is preserved
    this.status.running = true;
    this.status.startedAt = new Date();
    this.status.totalPolls = 0;
    this.status.results = [];

    // Perform initial poll immediately
    try {
      await this.poll();
    } catch (error) {
      console.error('[Heartbeat] Initial poll failed, but continuing:', error);
    }

    // Schedule recurring polls
    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, intervalMs);

    console.log(
      `[Heartbeat] Started with interval ${this.config.interval} (${intervalMs}ms)`
    );
  }

  /**
   * Stops the heartbeat daemon gracefully
   *
   * Clears the polling interval and updates status.
   * Safe to call multiple times - will no-op if not running.
   */
  async stop(): Promise<void> {
    if (!this.status.running) {
      console.log('[Heartbeat] Not running, ignoring stop request');
      return;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.status.running = false;
    console.log(
      `[Heartbeat] Stopped after ${this.status.totalPolls} polls`
    );
  }

  /**
   * Gets the current status of the daemon
   *
   * @returns A copy of the current HeartbeatStatus (defensive copy)
   */
  getStatus(): HeartbeatStatus {
    return {
      ...this.status,
      results: [...this.status.results],
    };
  }

  // ============================================================================
  // Polling Logic
  // ============================================================================

  /**
   * Performs a single poll of all enabled bays
   *
   * Iterates through configured bays, checks for new items,
   * evaluates triggers, and creates tasks as needed.
   */
  private async poll(): Promise<void> {
    if (!this.config) {
      console.warn('[Heartbeat] Poll called but no config loaded');
      return;
    }

    // Prevent concurrent polls - return immediately if already polling
    if (this.isPolling) {
      console.warn('[Heartbeat] Poll already in progress, skipping');
      return;
    }

    this.isPolling = true;
    try {
      const pollTimestamp = new Date();
      this.status.lastPollAt = pollTimestamp;
      this.status.totalPolls++;

      console.log(`[Heartbeat] Poll #${this.status.totalPolls} starting`);

      for (const [bayName, bayConfig] of Object.entries(this.config.bays)) {
        if (!bayConfig.enabled) {
          console.log(`[Heartbeat] Skipping disabled bay: ${bayName}`);
          continue;
        }

        const result = await this.pollBay(bayName, bayConfig);

        // Keep last 10 results (circular buffer pattern)
        this.status.results = [result, ...this.status.results].slice(0, 10);

        if (result.itemsFound > 0 || result.errors.length > 0) {
          console.log(
            `[Heartbeat] Bay "${bayName}": ${result.itemsFound} items, ${result.tasksCreated} tasks, ${result.errors.length} errors`
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Polls a single bay for new items and processes triggers
   *
   * @param bayName - Name of the bay to poll
   * @param config - Configuration for this bay
   * @returns Result of the poll operation
   */
  private async pollBay(
    bayName: string,
    config: BayConfig
  ): Promise<HeartbeatResult> {
    const result: HeartbeatResult = {
      bayName,
      timestamp: new Date(),
      itemsFound: 0,
      tasksCreated: 0,
      errors: [],
    };

    try {
      // Check bay for new items
      const items = await this.checkBay(bayName);
      result.itemsFound = items.length;

      // Evaluate triggers for each item (pure programmatic, NO AI)
      for (const item of items) {
        const triggeredActions = this.evaluateTriggers(item, config.triggers);

        for (const trigger of triggeredActions) {
          if (trigger.action === 'create_task') {
            try {
              // Create task with bay source for traceability
              await createTask(
                `[${bayName}] ${item.content.slice(0, 100)}`,
                item.content,
                trigger.priority ?? 50,
                `heartbeat:${bayName}`
              );
              result.tasksCreated++;
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : 'Unknown error';
              result.errors.push(`Task creation failed: ${errorMsg}`);
              console.error(
                `[Heartbeat] Task creation failed for bay "${bayName}": ${errorMsg}`
              );
            }
          }
          // Future: handle 'notify' and 'ignore' actions
        }
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Bay check failed: ${errorMsg}`);
      console.error(`[Heartbeat] Bay check failed for "${bayName}": ${errorMsg}`);
    }

    return result;
  }

  // ============================================================================
  // Bay Checking (Stubs for now)
  // ============================================================================

  /**
   * Checks a bay for new items
   *
   * Currently a stub that returns empty array.
   * Will be implemented per bay type (chat, email, RSS, etc.)
   *
   * @param bayName - Name of the bay to check
   * @returns Array of new items found in the bay
   */
  private async checkBay(bayName: string): Promise<BayItem[]> {
    // TODO: Implement actual bay checking per bay type
    // For now, return empty array (no new items)

    switch (bayName) {
      case 'chat':
        return this.checkChatBay();
      default:
        console.log(`[Heartbeat] Unknown bay type: ${bayName}`);
        return [];
    }
  }

  /**
   * Checks the chat bay for unprocessed messages
   *
   * Stub implementation - will query chat messages table
   * for messages not yet processed by heartbeat.
   *
   * @returns Array of unprocessed chat messages as BayItems
   */
  private async checkChatBay(): Promise<BayItem[]> {
    // TODO: Implement actual chat bay checking
    // - Query messages table for unprocessed messages
    // - Mark messages as processed after returning
    // - Filter by lastProcessedId or timestamp
    console.log('[Heartbeat] Checking chat bay (stub)');
    return [];
  }

  // ============================================================================
  // Trigger Evaluation (Pure Programmatic - NO AI)
  // ============================================================================

  /**
   * Evaluates triggers against an item to find matches
   *
   * IMPORTANT: This is pure programmatic evaluation with NO AI calls.
   * All matching is done via simple pattern matching and comparisons.
   *
   * @param item - The bay item to evaluate
   * @param triggers - List of trigger conditions to check
   * @returns Array of trigger conditions that matched
   */
  private evaluateTriggers(
    item: BayItem,
    triggers: TriggerCondition[]
  ): TriggerCondition[] {
    const matched: TriggerCondition[] = [];

    for (const trigger of triggers) {
      let isMatch = false;

      switch (trigger.type) {
        case 'all':
          // Always matches - used for "process all items"
          isMatch = true;
          break;

        case 'keyword':
          // Case-insensitive keyword matching in content
          isMatch = trigger.value
            ? item.content.toLowerCase().includes(trigger.value.toLowerCase())
            : false;
          break;

        case 'sender':
          // Exact sender/source matching
          isMatch = trigger.value ? item.source === trigger.value : false;
          break;

        case 'pattern':
          // Regex pattern matching (case-insensitive)
          // ReDoS protection: validate pattern before constructing RegExp
          if (trigger.value) {
            const patternLength = trigger.value.length;
            // Enforce max length and basic complexity checks
            if (patternLength > 1000) {
              console.warn(
                `[Heartbeat] Pattern too long (${patternLength} chars), treating as no-match`
              );
              isMatch = false;
            } else if (/[^\\w\s\.\-\+\[\]\(\)\{\}\|\$\^\*\?\!\=]/.test(trigger.value)) {
              // Only allow safe characters: word chars, spaces, basic regex metachars
              // Block: quantifiers like {n,m}, lookaheads, backreferences, etc.
              console.warn(
                `[Heartbeat] Pattern contains unsafe characters, treating as no-match: ${trigger.value.slice(0, 50)}`
              );
              isMatch = false;
            } else {
              try {
                const regex = new RegExp(trigger.value, 'i');
                isMatch = regex.test(item.content);
              } catch {
                console.warn(
                  `[Heartbeat] Invalid regex pattern: ${trigger.value.slice(0, 50)}`
                );
                isMatch = false;
              }
            }
          } else {
            isMatch = false;
          }
          break;

        default: {
          // Exhaustive check - TypeScript will catch missing cases
          const _exhaustiveCheck: never = trigger.type;
          console.warn(`[Heartbeat] Unknown trigger type: ${_exhaustiveCheck}`);
          isMatch = false;
        }
      }

      if (isMatch) {
        matched.push(trigger);
      }
    }

    return matched;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Singleton instance for server-wide heartbeat daemon */
let daemonInstance: HeartbeatDaemon | null = null;

/**
 * Gets or creates the singleton HeartbeatDaemon instance
 *
 * Use this function to access the daemon throughout the application.
 * The daemon is lazily instantiated on first call.
 *
 * @returns The singleton HeartbeatDaemon instance
 */
export function getHeartbeatDaemon(): HeartbeatDaemon {
  if (!daemonInstance) {
    daemonInstance = new HeartbeatDaemon();
  }
  return daemonInstance;
}

/**
 * Resets the singleton instance (primarily for testing)
 *
 * @internal
 */
export function _resetDaemonInstance(): void {
  if (daemonInstance) {
    void daemonInstance.stop();
  }
  daemonInstance = null;
}
