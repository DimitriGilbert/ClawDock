#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { createAgent } from './create.js';
import { listAgents } from './list.js';
import { chatAgent } from './chat.js';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to read package.json for version
let version = '0.0.0';
try {
  const pkg = fs.readJsonSync(join(__dirname, '../package.json'));
  version = pkg.version;
} catch (e) {
  // Ignore
}

const program = new Command();

program
  .name('clawport')
  .description('CLI for managing ClawDock agents')
  .version(version);

program
  .command('create')
  .argument('<name>', 'Name of the agent')
  .description('Create a new agent with isolated ports')
  .action(async (name: string) => {
    try {
      await createAgent(name);
    } catch (e) {
      console.error(chalk.red((e as Error).message));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all created agents and their status')
  .action(async () => {
    try {
      await listAgents();
    } catch (e) {
      console.error(chalk.red((e as Error).message));
      process.exit(1);
    }
  });

program
  .command('chat')
  .argument('<name>', 'Name/Slug of the agent')
  .description('Chat with an agent via CLI')
  .action(async (name: string) => {
    try {
      await chatAgent(name);
    } catch (e) {
      console.error(chalk.red((e as Error).message));
      process.exit(1);
    }
  });

program.parse();
