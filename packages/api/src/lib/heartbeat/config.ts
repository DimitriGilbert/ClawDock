/**
 * Heartbeat Daemon Configuration Loader
 *
 * Loads and parses heartbeat configuration from YAML files.
 * Provides sensible defaults if config file doesn't exist.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { env } from '@ClawDock/env/server';
import type { HeartbeatConfig, BayConfig, TriggerCondition } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default trigger for chat bay - creates tasks for all messages
 */
const DEFAULT_CHAT_TRIGGER: TriggerCondition = {
  type: 'all',
  action: 'create_task',
  priority: 50,
};

/**
 * Default bay configuration for chat
 */
const DEFAULT_CHAT_BAY: BayConfig = {
  checkInterval: '30s',
  enabled: true,
  triggers: [DEFAULT_CHAT_TRIGGER],
};

/**
 * Default configuration used when no config file exists
 */
const DEFAULT_CONFIG: HeartbeatConfig = {
  interval: '60s',
  bays: {
    chat: DEFAULT_CHAT_BAY,
  },
};

// ============================================================================
// Interval Parsing
// ============================================================================

/**
 * Parse a time interval string to milliseconds
 *
 * @param interval - Time interval string like "60s", "5m", "1h"
 * @returns Milliseconds, defaults to 60000 (1 minute) if invalid
 *
 * @example
 * parseInterval("30s") // 30000
 * parseInterval("5m")  // 300000
 * parseInterval("1h")  // 3600000
 */
export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    return 60000; // Default 1 minute
  }

  const valueStr = match[1];
  const unit = match[2];

  // TypeScript guard: regex capture groups might be undefined
  if (valueStr === undefined || unit === undefined) {
    return 60000;
  }

  const value = parseInt(valueStr, 10);

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return 60000;
  }
}

// ============================================================================
// YAML Config Shape (for parsing)
// ============================================================================

/**
 * Shape of trigger condition in YAML config
 */
interface YamlTriggerCondition {
  type?: string;
  value?: string;
  action?: string;
  priority?: number;
}

/**
 * Shape of bay config in YAML config
 */
interface YamlBayConfig {
  check_interval?: string;
  enabled?: boolean;
  triggers?: YamlTriggerCondition[];
}

/**
 * Shape of the parsed YAML config file
 */
interface YamlConfig {
  heartbeat?: {
    interval?: string;
    bays?: Record<string, YamlBayConfig>;
  };
}

// ============================================================================
// Config Transformation
// ============================================================================

/**
 * Transform a YAML trigger condition to typed TriggerCondition
 */
function transformTrigger(yaml: YamlTriggerCondition): TriggerCondition {
  const type = yaml.type ?? 'all';
  const action = yaml.action ?? 'create_task';

  // Validate type
  const validTypes = ['keyword', 'sender', 'pattern', 'all'] as const;
  const triggerType = validTypes.includes(type as (typeof validTypes)[number])
    ? (type as TriggerCondition['type'])
    : 'all';

  // Validate action
  const validActions = ['create_task', 'notify', 'ignore'] as const;
  const triggerAction = validActions.includes(action as (typeof validActions)[number])
    ? (action as TriggerCondition['action'])
    : 'create_task';

  return {
    type: triggerType,
    value: yaml.value,
    action: triggerAction,
    priority: yaml.priority,
  };
}

/**
 * Transform a YAML bay config to typed BayConfig
 */
function transformBayConfig(yaml: YamlBayConfig): BayConfig {
  return {
    checkInterval: yaml.check_interval ?? '5m',
    enabled: yaml.enabled ?? true,
    triggers: yaml.triggers?.map(transformTrigger) ?? [],
  };
}

/**
 * Transform parsed YAML to typed HeartbeatConfig
 */
function transformConfig(yaml: YamlConfig): HeartbeatConfig {
  const heartbeat = yaml.heartbeat;
  if (!heartbeat) {
    return DEFAULT_CONFIG;
  }

  const bays: Record<string, BayConfig> = {};
  if (heartbeat.bays) {
    for (const [name, bayYaml] of Object.entries(heartbeat.bays)) {
      bays[name] = transformBayConfig(bayYaml);
    }
  }

  return {
    interval: heartbeat.interval ?? '60s',
    bays: Object.keys(bays).length > 0 ? bays : DEFAULT_CONFIG.bays,
  };
}

// ============================================================================
// Config Loader
// ============================================================================

/**
 * Load heartbeat configuration from YAML file
 *
 * Reads from data/Clawthis/config/heartbeat.yml (or configured AGENT_DATA_PATH)
 * Returns default configuration if file doesn't exist or can't be parsed
 *
 * @returns Parsed HeartbeatConfig
 */
export async function loadConfig(): Promise<HeartbeatConfig> {
  const configPath = `${env.AGENT_DATA_PATH}/config/heartbeat.yml`;

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(content) as unknown;

    // Type guard to validate parsed content
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_CONFIG;
    }

    return transformConfig(parsed as YamlConfig);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Get the default configuration (useful for testing)
 */
export function getDefaultConfig(): HeartbeatConfig {
  return { ...DEFAULT_CONFIG };
}
