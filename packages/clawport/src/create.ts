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
  type AgentPorts,
  isComposeFile,
  extractHostPort
} from './utils.js';

const execAsync = promisify(exec);

// Maximum valid TCP port
const MAX_PORT = 65535;

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
        const parsed: unknown = parse(content);
        
        // Validate the parsed YAML structure
        if (!isComposeFile(parsed)) {
          console.warn(chalk.yellow(`Warning: Invalid compose structure in ${composePath}`));
          continue;
        }
        
        const services = parsed.services || {};
        
        // Iterate all services and find those ending with '-traefik'
        for (const serviceName of Object.keys(services)) {
          if (serviceName.endsWith('-traefik')) {
            const traefikPorts = services[serviceName]?.ports || [];
            for (const portMapping of traefikPorts) {
              if (typeof portMapping === 'string') {
                const hostPortStr = extractHostPort(portMapping);
                if (hostPortStr) {
                  const hostPort = parseInt(hostPortStr, 10);
                  if (!isNaN(hostPort)) {
                    usedPorts.add(hostPort);
                  }
                }
              } else if (typeof portMapping === 'number') {
                usedPorts.add(portMapping);
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
    
    // Upper-bound guard: ensure we don't exceed valid TCP port range
    if (blockEnd > MAX_PORT) {
      throw new Error(
        `Cannot allocate ports: next available block (${blockStart}-${blockEnd}) ` +
        `exceeds maximum valid port ${MAX_PORT}. No available port blocks remaining.`
      );
    }
    
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

  // Targeted String Replacements (avoid global replace to protect DB credentials and labels)
  let composeContent = templateRaw
    // Replace service names and container names
    .replace(/clawdock-traefik/g, `${slug}-traefik`)
    .replace(/clawdock-postgres/g, `${slug}-postgres`)
    .replace(/clawdock-opencode/g, `${slug}-opencode`)
    .replace(/clawdock-gateway/g, `${slug}-gateway`)
    // Replace network and volume names
    .replace(/clawdock-network/g, `${slug}-network`)
    .replace(/clawdock-postgres-data/g, `${slug}-postgres-data`)
    // Update Traefik routing rules to use per-agent hostname pattern
    .replace(/Host\(`gateway\.localhost`\)/g, `Host(\`gateway.${slug}.localhost\`)`)
    .replace(/Host\(`opencode\.localhost`\)/g, `Host(\`opencode.${slug}.localhost\`)`)
    // Replace project name at top level
    .replace(/^name: clawdock$/m, `name: ${slug}`);

  // YAML Transformations for Ports and Build Context
  const composeYaml: unknown = parse(composeContent);
  if (!isComposeFile(composeYaml)) {
    throw new Error(`Template at ${TEMPLATE_PATH} is not a valid Compose file`);
  }
  const services = composeYaml.services;
  
  // Update Traefik Ports
  const traefikService = services?.[`${slug}-traefik`];
  if (traefikService) {
    traefikService.ports = [
      `${ports.http}:80`,
      `${ports.https}:443`,
      `${ports.dashboard}:8080`
    ];
  }

  // Update Gateway Build Context
  const gatewayService = services?.[`${slug}-gateway`];
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
  const opencodeService = services?.[`${slug}-opencode`];
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

  // 6. Create .gitignore to exclude sensitive files
  const gitignoreContent = `# Sensitive files - do not commit
.env
.env.local
.env.*.local

# Docker volumes
data/

# IDE
.idea/
.vscode/
*.swp
*.swo
`;
  await fs.writeFile(join(agentDir, '.gitignore'), gitignoreContent);

  // 7. Git Init
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
