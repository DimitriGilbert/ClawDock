import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Path to the monorepo root (from dist/utils.js or src/utils.ts)
// When running from dist/, we are in packages/clawport/dist
// Root is ../../..
export const ROOT_DIR = resolve(__dirname, '../../..');
export const DATA_DIR = join(ROOT_DIR, 'data');
export const TEMPLATE_PATH = join(ROOT_DIR, 'ClawDock.yml');

// Port allocation configuration
export const BASE_PORT = 8000;
export const PORTS_PER_AGENT = 10;

// Port offsets within an agent's block
export const PORT_OFFSETS = {
  TRAEFIK_HTTP: 0,
  TRAEFIK_HTTPS: 1,
  TRAEFIK_DASH: 2,
  GATEWAY: 3,
  OPENCODE: 4,
};

export interface AgentPorts {
  http: number;
  https: number;
  dashboard: number;
  gateway: number;
  opencode: number;
}

// Interface for Docker Compose file structure
export interface ComposeFile {
  services?: Record<string, {
    ports?: (string | number)[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Type guard for ComposeFile
 */
export function isComposeFile(obj: unknown): obj is ComposeFile {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const maybeCompose = obj as Record<string, unknown>;
  if ('services' in maybeCompose && maybeCompose.services !== undefined) {
    if (typeof maybeCompose.services !== 'object' || maybeCompose.services === null) {
      return false;
    }
  }
  return true;
}

/**
 * Extract host port from a Docker port mapping string.
 * Handles both two-part (8000:80) and three-part (0.0.0.0:8000:80) mappings.
 *
 * @param mapping - Port mapping string like "8000:80" or "0.0.0.0:8000:80"
 * @returns The host port as string, or empty string if not found
 */
export function extractHostPort(mapping: string): string {
  const parts = mapping.split(':');
  if (parts.length >= 2) {
    // For "8000:80" -> parts = ["8000", "80"], take parts[0] = "8000"
    // For "0.0.0.0:8000:80" -> parts = ["0.0.0.0", "8000", "80"], take parts[1] = "8000"
    // General rule: host port is second-to-last element
    return parts[parts.length - 2] ?? '';
  }
  return '';
}
