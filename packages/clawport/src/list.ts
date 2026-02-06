import fs from 'fs-extra';
import { join } from 'node:path';
import { parse } from 'yaml';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from './utils.js';

const execAsync = promisify(exec);

// Interface for Docker Compose file structure
interface ComposeFile {
  services?: Record<string, {
    ports?: (string | number)[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// Type guard for ComposeFile
function isComposeFile(obj: unknown): obj is ComposeFile {
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
 */
function extractHostPort(mapping: string): string {
  const parts = mapping.split(':');
  if (parts.length >= 2) {
    // For "8000:80" -> parts[0] = "8000"
    // For "0.0.0.0:8000:80" -> parts[1] = "8000"
    return parts[parts.length - 2] || 'Unknown';
  }
  return 'Unknown';
}

interface AgentInfo {
  name: string;
  statusRaw: string;
  statusColored: string;
  url: string;
}

export async function listAgents() {
  if (!await fs.pathExists(DATA_DIR)) {
    console.log(chalk.yellow('No agents found (data directory missing).'));
    return;
  }

  const dirs = await fs.readdir(DATA_DIR);
  const agents: AgentInfo[] = [];

  // Get running containers
  let runningContainers = new Set<string>();
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    runningContainers = new Set(stdout.trim().split('\n'));
  } catch {
    // Docker might not be running or accessible
  }

  for (const slug of dirs) {
    const composePath = join(DATA_DIR, slug, 'docker-compose.yml');
    if (await fs.pathExists(composePath)) {
      try {
        const content = await fs.readFile(composePath, 'utf8');
        const parsed: unknown = parse(content);
        
        // Validate the parsed YAML structure
        if (!isComposeFile(parsed)) {
          continue;
        }
        
        // Find Gateway Service Name
        const gatewayName = `${slug}-gateway`;
        const isRunning = runningContainers.has(gatewayName);
        
        // Find Gateway Port
        // We look for Traefik ports since Gateway is behind Traefik
        const traefikName = `${slug}-traefik`;
        const traefikService = parsed.services?.[traefikName];
        let httpPort = 'Unknown';
        
        if (traefikService?.ports) {
          for (const mapping of traefikService.ports) {
            if (typeof mapping === 'string' && mapping.endsWith(':80')) {
              httpPort = extractHostPort(mapping);
            }
          }
        }

        // Store both raw status (for alignment) and colored status (for display)
        const statusRaw = isRunning ? 'Running' : 'Stopped';
        const statusColored = isRunning ? chalk.green('Running') : chalk.gray('Stopped');

        agents.push({
          name: slug,
          statusRaw,
          statusColored,
          url: httpPort !== 'Unknown' ? `http://localhost:${httpPort}` : 'N/A'
        });
      } catch {
        // Skip malformed
      }
    }
  }

  if (agents.length === 0) {
    console.log(chalk.yellow('No agents found.'));
    return;
  }

  console.log(chalk.bold.underline('ClawDock Agents\n'));
  console.log(`${chalk.bold('Name'.padEnd(20))} ${chalk.bold('Status'.padEnd(15))} ${chalk.bold('Gateway URL')}`);
  
  agents.forEach(agent => {
    // Calculate padding based on raw status length, then apply color
    const paddedStatus = agent.statusRaw.padEnd(15);
    const coloredPaddedStatus = agent.statusRaw === 'Running' 
      ? chalk.green(paddedStatus) 
      : chalk.gray(paddedStatus);
    
    console.log(`${agent.name.padEnd(20)} ${coloredPaddedStatus} ${agent.url}`);
  });
}
