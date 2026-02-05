import fs from 'fs-extra';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { 
  DATA_DIR, 
  TEMPLATE_PATH, 
  BASE_PORT, 
  PORTS_PER_AGENT, 
  PORT_OFFSETS,
  type AgentPorts 
} from './utils.js';

const execAsync = promisify(exec);

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
}

async function getUsedPorts(): Promise<Set<number>> {
  const usedPorts = new Set<number>();
  
  if (!await fs.pathExists(DATA_DIR)) {
    return usedPorts;
  }

  const dirs = await fs.readdir(DATA_DIR);
  
  for (const dir of dirs) {
    const composePath = join(DATA_DIR, dir, 'docker-compose.yml');
    if (await fs.pathExists(composePath)) {
      try {
        const content = await fs.readFile(composePath, 'utf8');
        const yaml = parse(content);
        
        // Check Traefik ports
        const traefikPorts = yaml.services?.traefik?.ports || [];
        for (const portMapping of traefikPorts) {
          if (typeof portMapping === 'string') {
            const parts = portMapping.split(':');
            const portStr = parts[0];
            if (portStr) {
              const hostPort = parseInt(portStr);
              if (!isNaN(hostPort)) {
                usedPorts.add(hostPort);
              }
            }
          }
        }
      } catch (e) {
        console.warn(chalk.yellow(`Warning: Could not parse ${composePath}`));
      }
    }
  }
  
  return usedPorts;
}

async function allocatePorts(): Promise<AgentPorts> {
  const usedPorts = await getUsedPorts();
  let base = BASE_PORT;
  
  while (true) {
    // Check if this block is free
    const blockStart = base;
    const blockEnd = base + PORTS_PER_AGENT - 1;
    let collision = false;
    
    for (let p = blockStart; p <= blockEnd; p++) {
      if (usedPorts.has(p)) {
        collision = true;
        break;
      }
    }
    
    if (!collision) {
      return {
        http: base + PORT_OFFSETS.TRAEFIK_HTTP,
        https: base + PORT_OFFSETS.TRAEFIK_HTTPS,
        dashboard: base + PORT_OFFSETS.TRAEFIK_DASH,
        gateway: base + PORT_OFFSETS.GATEWAY,
        opencode: base + PORT_OFFSETS.OPENCODE
      };
    }
    
    base += PORTS_PER_AGENT;
  }
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createAgent(name: string) {
  const slug = slugify(name);
  const agentDir = join(DATA_DIR, slug);
  
  if (await fs.pathExists(agentDir)) {
    throw new Error(`Agent directory ${slug} already exists!`);
  }

  console.log(chalk.blue(`Creating agent "${name}" (${slug})...`));

  // 1. Allocate Ports
  const ports = await allocatePorts();
  console.log(chalk.gray(`Allocated ports: HTTP=${ports.http}, HTTPS=${ports.https}, Dashboard=${ports.dashboard}, Gateway=${ports.gateway}`));

  // 2. Create Directories
  const dirs = ['agents', 'config', 'workspace', 'data'];
  for (const dir of dirs) {
    await fs.ensureDir(join(agentDir, dir));
  }

  // 3. Generate Docker Compose
  const templateRaw = await fs.readFile(TEMPLATE_PATH, 'utf8');
  
  // Basic String Replacement
  let composeContent = templateRaw.replace(/clawdock/g, slug);
  
  // YAML Transformations for Ports and Build Context
  const composeYaml = parse(composeContent);
  
  // Update Traefik Ports
  const traefikService = composeYaml.services[`${slug}-traefik`];
  if (traefikService) {
    traefikService.ports = [
      `${ports.http}:80`,
      `${ports.https}:443`,
      `${ports.dashboard}:8080`
    ];
  }

  // Update Gateway Build Context
  const gatewayService = composeYaml.services[`${slug}-gateway`];
  if (gatewayService) {
    // Point to monorepo root
    gatewayService.build = {
      context: '../../',
      dockerfile: 'apps/server/Dockerfile'
    };
    
    // Ensure environment uses the correct ports if needed
    // (Currently gateway uses internal networking, so no change needed there unless external access is required)
  }
  
  // Update Opencode ports
  const opencodeService = composeYaml.services[`${slug}-opencode`];
  if (opencodeService) {
    // Map host port for external access if needed, or keep internal
    // The template has labels for Traefik, but we might want direct access for CLI
    // Let's rely on Traefik for now, but strictly speaking CLI might need direct access if not using Traefik
    // For now, we update Traefik loadbalancer ports in labels if they were hardcoded, but they are internal ports (4096)
  }

  await fs.writeFile(join(agentDir, 'docker-compose.yml'), stringify(composeYaml));

  // 4. Generate .env
  const envContent = `
DB_PASSWORD=${generateSecret()}
OPENCODE_PASSWORD=${generateSecret()}
SNAPSHOT_MASTER_KEY=${generateSecret()}
# AI Keys (Empty by default)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
`.trim();
  await fs.writeFile(join(agentDir, '.env'), envContent);

  // 5. Generate Identity Files
  await fs.writeFile(join(agentDir, 'agents/AGENTS.md'), `# ${name}\n\nAgent operational guidelines.`);
  await fs.writeFile(join(agentDir, 'agents/SOUL.md'), `# Soul of ${name}\n\nIdentity and personality.`);
  await fs.writeFile(join(agentDir, 'agents/GOALS.md'), `# Goals\n\n1. Exist.`);
  await fs.writeFile(join(agentDir, 'agents/REFLECTION.md'), `# Reflection\n\nSelf-awareness log.`);

  // 6. Git Init
  try {
    console.log(chalk.gray('Initializing git repository...'));
    await execAsync('git init', { cwd: agentDir });
    await execAsync('git add .', { cwd: agentDir });
    await execAsync('git commit -m "Initial commit by Clawport"', { cwd: agentDir });
  } catch (e) {
    console.warn(chalk.yellow('Failed to initialize git repo:'), e);
  }

  console.log(chalk.green(`\nAgent ${name} created successfully at data/${slug}!`));
  console.log(chalk.cyan(`\nTo start:\n  cd data/${slug}\n  docker compose up -d`));
}
