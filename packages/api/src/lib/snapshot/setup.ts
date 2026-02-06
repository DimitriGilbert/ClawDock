import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@ClawDock/env/server";
import { db, snapshotSettings } from "@ClawDock/db";
import { ensureGitRepo } from "./git";
import { SNAPSHOT_SETTINGS_ID } from "./service";

/**
 * .gitignore template for agent data directory
 * Excludes secrets, binary files, workspace, and build artifacts
 */
const GITIGNORE_TEMPLATE = `# Secrets
.env
*.pem
*.key

# Binary database files
data/db/
*.pid
pg_log/

# Workspace (apps have their own repos)
workspace/

# Dependencies and build artifacts
node_modules/
dist/
build/
*.log

# System files
.DS_Store
Thumbs.db

# Large files
data/files/
*.tar.gz
*.zip
`;

/**
 * Ensures .gitignore file exists with proper exclusions
 * @param agentDataPath - Path to the agent data directory
 */
export async function ensureGitignore(agentDataPath: string): Promise<void> {
  const gitignorePath = join(agentDataPath, ".gitignore");

  try {
    // Check if .gitignore already exists
    await access(gitignorePath);
    // If it exists, we don't modify it (user may have custom rules)
    return;
  } catch {
    // .gitignore doesn't exist, create it
  }

  // Write the .gitignore template
  await writeFile(gitignorePath, GITIGNORE_TEMPLATE, "utf-8");
}

/**
 * Ensures the .snapshots directory exists for manifest storage
 * @param agentDataPath - Path to the agent data directory
 */
export async function ensureSnapshotsDirectory(agentDataPath: string): Promise<void> {
  const snapshotsDir = join(agentDataPath, ".snapshots");
  await mkdir(snapshotsDir, { recursive: true });
}

/**
 * Ensures default snapshot settings exist in the database
 * Uses atomic upsert to prevent duplicate rows under concurrent requests
 */
async function ensureDefaultSettings(): Promise<void> {
  const now = new Date();

  // Atomic upsert: insert or ignore on conflict (prevents duplicate rows under concurrent requests)
  await db
    .insert(snapshotSettings)
    .values({
      id: SNAPSHOT_SETTINGS_ID,
      maxSnapshots: 30,
      preChangeCompose: true,
      preChangeAgentFiles: true,
      includeDatabase: true,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: snapshotSettings.id });
}

/**
 * Initializes the entire snapshot system
 * - Ensures git repository is initialized
 * - Ensures .gitignore exists with proper exclusions
 * - Ensures .snapshots directory exists
 * - Ensures default settings exist in database
 *
 * This should be called on server startup
 */
export async function initializeSnapshotSystem(): Promise<void> {
  const agentDataPath = env.AGENT_DATA_PATH;

  // 1. Ensure .git directory exists
  await ensureGitRepo(agentDataPath);

  // 2. Ensure .gitignore exists with proper exclusions
  await ensureGitignore(agentDataPath);

  // 3. Ensure .snapshots directory exists
  await ensureSnapshotsDirectory(agentDataPath);

  // 4. Ensure default settings exist in database
  await ensureDefaultSettings();
}

/**
 * Gets the path to the snapshots directory
 * @param agentDataPath - Path to the agent data directory
 * @returns Path to the .snapshots directory
 */
export function getSnapshotsDirectory(agentDataPath: string): string {
  return join(agentDataPath, ".snapshots");
}

/**
 * Gets the path to the manifest file
 * @param agentDataPath - Path to the agent data directory
 * @returns Path to the manifest.json file
 */
export function getManifestPath(agentDataPath: string): string {
  return join(agentDataPath, ".snapshots", "manifest.json");
}

/**
 * Gets the path to database backups directory
 * @param agentDataPath - Path to the agent data directory
 * @returns Path to the db-backups directory
 */
export function getDbBackupsDirectory(agentDataPath: string): string {
  return join(agentDataPath, "data", "db-backups");
}
