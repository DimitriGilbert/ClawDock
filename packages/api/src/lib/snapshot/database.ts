/**
 * Database Backup Manager
 * 
 * Handles PostgreSQL database backups using pg_dump and restores using psql.
 * All backups are gzip-compressed and stored in the agent's data directory.
 * 
 * @module snapshot/database
 */

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { env } from '@ClawDock/env/server';
import { SnapshotError } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Parsed database connection parameters from DATABASE_URL
 */
interface DatabaseConnectionParams {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

/**
 * Parse DATABASE_URL into connection parameters
 * 
 * Expected format: postgresql://user:password@host:port/database
 * 
 * @param url - The DATABASE_URL connection string
 * @returns Parsed connection parameters
 * @throws SnapshotError if URL format is invalid
 */
function parseDatabaseUrl(url: string): DatabaseConnectionParams {
  try {
    const parsedUrl = new URL(url);
    
    if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') {
      throw new SnapshotError(
        `Invalid database protocol: ${parsedUrl.protocol}. Expected postgresql://`,
        'VALIDATION_ERROR',
        { protocol: parsedUrl.protocol }
      );
    }

    const user = parsedUrl.username;
    const password = parsedUrl.password;
    const host = parsedUrl.hostname || 'localhost';
    const port = parsedUrl.port || '5432';
    // Remove leading slash from pathname to get database name
    const database = parsedUrl.pathname.replace(/^\//, '');

    if (!user) {
      throw new SnapshotError(
        'Database URL missing username',
        'VALIDATION_ERROR',
        { url: url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') } // Mask credentials in error
      );
    }

    if (!database) {
      throw new SnapshotError(
        'Database URL missing database name',
        'VALIDATION_ERROR',
        { url: url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') }
      );
    }

    return { host, port, database, user, password };
  } catch (error: unknown) {
    if (error instanceof SnapshotError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new SnapshotError(
      `Failed to parse DATABASE_URL: ${errorMessage}`,
      'VALIDATION_ERROR',
      { error: errorMessage }
    );
  }
}

/**
 * Ensure the backup directory exists
 * 
 * @param backupPath - Full path to the backup file
 * @throws SnapshotError if directory creation fails
 */
async function ensureBackupDirectory(backupPath: string): Promise<void> {
  const backupDir = dirname(backupPath);
  
  try {
    await mkdir(backupDir, { recursive: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new SnapshotError(
      `Failed to create backup directory: ${errorMessage}`,
      'DB_ERROR',
      { directory: backupDir, error: errorMessage }
    );
  }
}

/**
 * Create a database backup using pg_dump with gzip compression
 * 
 * Creates a compressed SQL dump of the PostgreSQL database using pg_dump.
 * The backup is stored at: {agentDataPath}/data/db-backups/snapshot-{snapshotId}.sql.gz
 * 
 * @param snapshotId - Unique identifier for this snapshot
 * @param agentDataPath - Path to the agent's data directory
 * @returns Path to the created backup file
 * @throws SnapshotError if backup creation fails
 * 
 * @example
 * ```typescript
 * const backupPath = await createDatabaseBackup('uuid-here', './data/Clawthis');
 * console.log(`Backup created at: ${backupPath}`);
 * ```
 */
export async function createDatabaseBackup(
  snapshotId: string,
  agentDataPath: string,
): Promise<string> {
  const backupPath = `${agentDataPath}/data/db-backups/snapshot-${snapshotId}.sql.gz`;
  
  try {
    // Ensure backup directory exists
    await ensureBackupDirectory(backupPath);
    
    // Parse database connection parameters
    const dbParams = parseDatabaseUrl(env.DATABASE_URL);
    
    // Build pg_dump arguments
    const pgDumpArgs: string[] = [
      '--host', dbParams.host,
      '--port', dbParams.port,
      '--username', dbParams.user,
      '--dbname', dbParams.database,
      '--verbose',
      '--no-owner',        // Don't include ownership commands
      '--no-privileges',   // Don't include privilege commands
      '--clean',           // Include DROP commands before CREATE
      '--if-exists',       // Use IF EXISTS for DROP commands
      '--compress', '9',   // Maximum compression level
    ];
    
    // Set PGPASSWORD environment variable for authentication
    const execEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: dbParams.password,
    };
    
    // Execute pg_dump with gzip compression using shell pipeline
    // We use shell: true here because we need the pipe to gzip
    const { stdout, stderr } = await execFileAsync(
      'sh',
      ['-c', `pg_dump ${pgDumpArgs.map(arg => `"${arg}"`).join(' ')} | gzip > "${backupPath}"`],
      { 
        env: execEnv,
        timeout: 300000, // 5 minute timeout for large databases
      }
    );
    
    // Log any warnings from stderr (pg_dump outputs progress to stderr)
    if (stderr && stderr.trim()) {
      console.log(`pg_dump output: ${stderr}`);
    }
    
    if (stdout) {
      console.log(`pg_dump stdout: ${stdout}`);
    }
    
    return backupPath;
  } catch (error: unknown) {
    // Clean up partial backup file if it exists
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(backupPath);
    } catch {
      // Ignore cleanup errors
    }
    
    if (error instanceof SnapshotError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for specific error conditions
    if (errorMessage.includes('pg_dump: not found') || errorMessage.includes('command not found')) {
      throw new SnapshotError(
        'pg_dump not found. Please ensure PostgreSQL client tools are installed.',
        'DB_ERROR',
        { 
          snapshotId, 
          backupPath,
          hint: 'Install PostgreSQL client tools (postgresql-client package)'
        }
      );
    }
    
    if (errorMessage.includes('Connection refused') || errorMessage.includes('could not connect')) {
      throw new SnapshotError(
        'Could not connect to PostgreSQL database',
        'DB_ERROR',
        { 
          snapshotId, 
          backupPath,
          hint: 'Verify database is running and DATABASE_URL is correct'
        }
      );
    }
    
    if (errorMessage.includes('authentication failed') || errorMessage.includes('password')) {
      throw new SnapshotError(
        'Database authentication failed',
        'DB_ERROR',
        { 
          snapshotId, 
          backupPath,
          hint: 'Verify DATABASE_URL credentials are correct'
        }
      );
    }
    
    throw new SnapshotError(
      `Failed to create database backup: ${errorMessage}`,
      'DB_ERROR',
      { snapshotId, backupPath, error: errorMessage }
    );
  }
}

/**
 * Restore database from a backup file
 * 
 * Restores the PostgreSQL database from a gzip-compressed SQL dump.
 * WARNING: This will overwrite the current database contents.
 * 
 * @param backupPath - Path to the backup file (.sql.gz)
 * @throws SnapshotError if restore fails
 * 
 * @example
 * ```typescript
 * await restoreDatabaseBackup('./data/Clawthis/data/db-backups/snapshot-uuid.sql.gz');
 * ```
 */
export async function restoreDatabaseBackup(backupPath: string): Promise<void> {
  try {
    // Parse database connection parameters
    const dbParams = parseDatabaseUrl(env.DATABASE_URL);
    
    // Build psql arguments
    const psqlArgs: string[] = [
      '--host', dbParams.host,
      '--port', dbParams.port,
      '--username', dbParams.user,
      '--dbname', dbParams.database,
      '--set', 'ON_ERROR_STOP=on', // Stop on first error
      '--echo-errors',             // Print failed commands
    ];
    
    // Set PGPASSWORD environment variable for authentication
    const execEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: dbParams.password,
    };
    
    // Execute gunzip piped to psql
    // We use shell: true here because we need the pipe from gunzip
    const { stdout, stderr } = await execFileAsync(
      'sh',
      ['-c', `gunzip -c "${backupPath}" | psql ${psqlArgs.map(arg => `"${arg}"`).join(' ')}`],
      { 
        env: execEnv,
        timeout: 600000, // 10 minute timeout for large restores
      }
    );
    
    // Log output for debugging
    if (stdout) {
      console.log(`psql stdout: ${stdout}`);
    }
    
    // psql outputs notices to stderr, so we only log warnings
    if (stderr && stderr.trim()) {
      console.log(`psql stderr: ${stderr}`);
    }
    
  } catch (error: unknown) {
    if (error instanceof SnapshotError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for specific error conditions
    if (errorMessage.includes('psql: not found') || errorMessage.includes('command not found')) {
      throw new SnapshotError(
        'psql not found. Please ensure PostgreSQL client tools are installed.',
        'DB_ERROR',
        { 
          backupPath,
          hint: 'Install PostgreSQL client tools (postgresql-client package)'
        }
      );
    }
    
    if (errorMessage.includes('Connection refused') || errorMessage.includes('could not connect')) {
      throw new SnapshotError(
        'Could not connect to PostgreSQL database',
        'DB_ERROR',
        { 
          backupPath,
          hint: 'Verify database is running and DATABASE_URL is correct'
        }
      );
    }
    
    if (errorMessage.includes('authentication failed') || errorMessage.includes('password')) {
      throw new SnapshotError(
        'Database authentication failed',
        'DB_ERROR',
        { 
          backupPath,
          hint: 'Verify DATABASE_URL credentials are correct'
        }
      );
    }
    
    if (errorMessage.includes('does not exist') && errorMessage.includes('database')) {
      throw new SnapshotError(
        'Target database does not exist',
        'DB_ERROR',
        { 
          backupPath,
          hint: 'Create the database before restoring'
        }
      );
    }
    
    if (errorMessage.includes('Permission denied') || errorMessage.includes('cannot execute')) {
      throw new SnapshotError(
        'Insufficient permissions to restore database',
        'DB_ERROR',
        { 
          backupPath,
          hint: 'Ensure database user has CREATE, DROP, and INSERT privileges'
        }
      );
    }
    
    throw new SnapshotError(
      `Failed to restore database backup: ${errorMessage}`,
      'DB_ERROR',
      { backupPath, error: errorMessage }
    );
  }
}

/**
 * Delete a database backup file
 * 
 * Removes a backup file from the filesystem. Safe to call even if file
 * doesn't exist (will not throw in that case).
 * 
 * @param backupPath - Path to the backup file to delete
 * @throws SnapshotError if deletion fails (other than file not found)
 * 
 * @example
 * ```typescript
 * await deleteDatabaseBackup('./data/Clawthis/data/db-backups/snapshot-uuid.sql.gz');
 * ```
 */
export async function deleteDatabaseBackup(backupPath: string): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(backupPath);
  } catch (error: unknown) {
    // If file doesn't exist, that's fine - just return
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new SnapshotError(
      `Failed to delete database backup: ${errorMessage}`,
      'DB_ERROR',
      { backupPath, error: errorMessage }
    );
  }
}
