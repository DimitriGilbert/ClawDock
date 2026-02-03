/**
 * OpenCode Provider Configuration
 * Connects to the containerized OpenCode Server for AI inference
 */

import { createOpencode } from "ai-sdk-provider-opencode-sdk";
import { env } from "@ClawDock/env/server";

/**
 * Create OpenCode provider instance pointing to containerized server
 * The server is expected to be running in a Docker container
 */
export const opencode = createOpencode({
  baseUrl: env.OPENCODE_URL,
  // OpenCode server handles its own authentication internally
  autoStartServer: false, // We expect server to be already running via Docker
});

/**
 * Default model to use for chat
 * In the future, this could be configurable per Agent
 */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
