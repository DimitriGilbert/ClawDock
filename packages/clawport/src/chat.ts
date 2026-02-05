import fs from 'fs-extra';
import { join } from 'node:path';
import { parse } from 'yaml';
import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { DATA_DIR } from './utils.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function parseDataStream(chunk: string): string | null {
  // Simple parser for AI SDK Data Stream Protocol (0:"text")
  // This is a naive implementation and might need robustness for split chunks
  // Protocol: 
  // 0: text part
  // e: error
  // d: data
  
  // We only care about 0 (text)
  const lines = chunk.split('\n');
  let text = '';
  
  for (const line of lines) {
    if (line.startsWith('0:')) {
      try {
        // Remove 0: and parse JSON string
        // 0:"hello" -> hello
        const content = JSON.parse(line.slice(2));
        text += content;
      } catch (e) {
        // Ignore parse errors (maybe incomplete chunk)
      }
    }
  }
  return text || null;
}

export async function chatAgent(name: string) {
  const slug = name; // Assuming name is slug for list lookup simplicity, or we re-slugify
  // But wait, user might type "My Agent".
  // Let's rely on list logic: find dir matching slug.
  // Actually, let's just use the exact name provided and try to resolve it.
  
  const agentDir = join(DATA_DIR, slug);
  if (!await fs.pathExists(agentDir)) {
    console.error(chalk.red(`Agent "${slug}" not found in data/`));
    return;
  }

  // Find Port
  const composePath = join(agentDir, 'docker-compose.yml');
  const content = await fs.readFile(composePath, 'utf8');
  const yaml = parse(content);
  
  // Find Traefik HTTP Port
  const traefikName = `${slug}-traefik`;
  const traefikService = yaml.services?.[traefikName];
  let port = '';
  
  if (traefikService?.ports) {
    for (const mapping of traefikService.ports) {
      if (typeof mapping === 'string' && mapping.endsWith(':80')) {
        port = mapping.split(':')[0] || '';
      }
    }
  }

  if (!port) {
    console.error(chalk.red('Could not determine agent URL.'));
    return;
  }

  const endpoint = `http://localhost:${port}/api/chat`;
  console.log(chalk.blue(`Connecting to ${slug} at ${endpoint}...`));
  console.log(chalk.gray('Type "exit" to quit.'));

  const messages: Message[] = [];
  const sessionId = Date.now().toString();

  while (true) {
    const userContent = await input({ message: chalk.green('You:') });
    
    if (userContent.toLowerCase() === 'exit') break;

    messages.push({ role: 'user', content: userContent });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'gateway.localhost' // Crucial for Traefik routing
        },
        body: JSON.stringify({
          messages,
          id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      if (!response.body) throw new Error('No response body');

      process.stdout.write(chalk.cyan('Agent: '));
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Handle Vercel AI SDK Data Stream
        // If the server returns raw text (not Data Stream), this parser will fail.
        // But the Gateway uses .toDataStreamResponse(), so it should be the protocol.
        
        const text = parseDataStream(chunk);
        if (text) {
          process.stdout.write(text);
          assistantMessage += text;
        } else {
          // Fallback if not using data stream protocol?
          // If the chunk doesn't match the protocol, maybe it's raw text?
          // Let's assume protocol for now.
        }
      }
      
      process.stdout.write('\n');
      messages.push({ role: 'assistant', content: assistantMessage });

    } catch (e) {
      console.error(chalk.red(`\nError: ${(e as Error).message}`));
    }
  }
}
