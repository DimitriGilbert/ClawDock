import fs from 'fs-extra';
import { join } from 'node:path';
import { parse } from 'yaml';
import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { DATA_DIR, isComposeFile } from './utils.js';
import { slugify } from './create.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ParseResult {
  text: string;
  remainder: string;
}

/**
 * Stateful parser for AI SDK Data Stream Protocol (0:"text")
 * Handles partial JSON values when chunks split lines.
 * 
 * @param chunk - Current chunk of data
 * @param prevRemainder - Incomplete line from previous chunk
 * @returns Object with parsed text and remainder for next call
 */
function parseDataStream(chunk: string, prevRemainder: string = ''): ParseResult {
  // Prepend any incomplete line from the previous chunk
  const data = prevRemainder + chunk;
  const lines = data.split('\n');
  
  let text = '';
  let remainder = '';
  
  // The last element might be incomplete (no trailing newline)
  // Keep it as remainder for the next chunk
  if (!data.endsWith('\n') && lines.length > 0) {
    remainder = lines.pop() || '';
  }
  
  for (const line of lines) {
    // Protocol: 0: text part, e: error, d: data
    // We only care about 0 (text)
    if (line.startsWith('0:')) {
      try {
        // Remove 0: and parse JSON string
        // 0:"hello" -> hello
        const content = JSON.parse(line.slice(2)) as string;
        text += content;
      } catch {
        // Ignore parse errors - line might still be malformed
        // This shouldn't happen if we're handling remainders correctly
      }
    }
  }
  
  return { text, remainder };
}

/**
 * Extract host port from a Docker port mapping string.
 * Handles both two-part (8000:80) and three-part (0.0.0.0:8000:80) mappings.
 * 
 * @param mapping - Port mapping string like "8000:80" or "0.0.0.0:8000:80"
 * @returns The host port as string, or empty string if not found
 */
function extractHostPort(mapping: string): string {
  const parts = mapping.split(':');
  if (parts.length >= 2) {
    // For "8000:80" -> parts = ["8000", "80"], take parts[0] = "8000"
    // For "0.0.0.0:8000:80" -> parts = ["0.0.0.0", "8000", "80"], take parts[1] = "8000"
    // General rule: host port is second-to-last element
    return parts[parts.length - 2] || '';
  }
  return '';
}

export async function chatAgent(name: string) {
  // Normalize name to slug for directory lookup
  const slug = slugify(name);
  
  const agentDir = join(DATA_DIR, slug);
  if (!await fs.pathExists(agentDir)) {
    console.error(chalk.red(`Agent "${name}" (resolved to slug: "${slug}") not found in data/`));
    return;
  }

  // Find Port
  const composePath = join(agentDir, 'docker-compose.yml');
  if (!await fs.pathExists(composePath)) {
    console.error(chalk.red(`No docker-compose.yml found for agent "${slug}".`));
    return;
  }
  const content = await fs.readFile(composePath, 'utf8');
  const parsedCompose: unknown = parse(content);
  
  // Validate the parsed YAML structure
  if (!isComposeFile(parsedCompose)) {
    console.error(chalk.red('Invalid docker-compose.yml structure.'));
    return;
  }
  
  // Find Traefik HTTP Port
  const traefikName = `${slug}-traefik`;
  const traefikService = parsedCompose.services?.[traefikName];
  let port = '';
  
  if (traefikService?.ports) {
    for (const mapping of traefikService.ports) {
      if (typeof mapping === 'string' && mapping.endsWith(':80')) {
        port = extractHostPort(mapping);
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
          'Host': `gateway.${slug}.localhost` // Crucial for Traefik routing
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
      let remainder = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Handle Vercel AI SDK Data Stream with stateful parsing
        const result = parseDataStream(chunk, remainder);
        remainder = result.remainder;
        
        if (result.text) {
          process.stdout.write(result.text);
          assistantMessage += result.text;
        }
      }
      
      // Process any remaining content after stream ends
      if (remainder) {
        const finalResult = parseDataStream(remainder + '\n', '');
        if (finalResult.text) {
          process.stdout.write(finalResult.text);
          assistantMessage += finalResult.text;
        }
      }
      
      process.stdout.write('\n');
      messages.push({ role: 'assistant', content: assistantMessage });

    } catch (e) {
      console.error(chalk.red(`\nError: ${(e as Error).message}`));
    }
  }
}
