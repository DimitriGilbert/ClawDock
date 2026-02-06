/**
 * Heartbeat Daemon Module
 *
 * Polling daemon that monitors bays (email, RSS, chat, etc.) and creates
 * tasks based on configurable triggers.
 *
 * @example
 * ```typescript
 * import { getHeartbeatDaemon } from '@ClawDock/api/lib/heartbeat';
 *
 * const daemon = getHeartbeatDaemon();
 * await daemon.start();
 * console.log(daemon.getStatus());
 * await daemon.stop();
 * ```
 */

// Types
export type {
  HeartbeatConfig,
  HeartbeatStatus,
  HeartbeatResult,
  TriggerCondition,
  TriggerType,
  TriggerAction,
  BayConfig,
  TimeInterval,
  HeartbeatErrorCode,
} from './types';
export { HeartbeatError } from './types';

// Config
export { loadConfig, parseInterval, getDefaultConfig } from './config';

// Service
export {
  HeartbeatDaemon,
  getHeartbeatDaemon,
  _resetDaemonInstance,
} from './service';
