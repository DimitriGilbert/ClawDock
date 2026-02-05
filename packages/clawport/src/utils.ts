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
