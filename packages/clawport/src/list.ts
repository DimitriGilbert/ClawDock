import fs from 'fs-extra';
import { join } from 'node:path';
import { parse } from 'yaml';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from './utils.js';

const execAsync = promisify(exec);

export async function listAgents() {
  if (!await fs.pathExists(DATA_DIR)) {
    console.log(chalk.yellow('No agents found (data directory missing).'));
    return;
  }

  const dirs = await fs.readdir(DATA_DIR);
  const agents = [];

  // Get running containers
  let runningContainers = new Set<string>();
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    runningContainers = new Set(stdout.trim().split('\n'));
  } catch (e) {
    // Docker might not be running or accessible
  }

  for (const slug of dirs) {
    const composePath = join(DATA_DIR, slug, 'docker-compose.yml');
    if (await fs.pathExists(composePath)) {
      try {
        const content = await fs.readFile(composePath, 'utf8');
        const yaml = parse(content);
        
        // Find Gateway Service Name
        const gatewayName = `${slug}-gateway`;
        const isRunning = runningContainers.has(gatewayName);
        
        // Find Gateway Port
        // We look for Traefik ports since Gateway is behind Traefik
        // Or if we exposed Gateway directly.
        // In our create logic, we only exposed Traefik.
        // So we look for Traefik's HTTP port (80 mapping).
        const traefikName = `${slug}-traefik`;
        const traefikService = yaml.services?.[traefikName];
        let httpPort = 'Unknown';
        
        if (traefikService?.ports) {
          for (const mapping of traefikService.ports) {
            if (typeof mapping === 'string' && mapping.endsWith(':80')) {
              httpPort = mapping.split(':')[0] || 'Unknown';
            }
          }
        }

        agents.push({
          name: slug,
          status: isRunning ? chalk.green('Running') : chalk.gray('Stopped'),
          url: httpPort !== 'Unknown' ? `http://localhost:${httpPort}` : 'N/A'
        });
      } catch (e) {
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
    console.log(`${agent.name.padEnd(20)} ${agent.status.padEnd(15)} ${agent.url}`);
  });
}
