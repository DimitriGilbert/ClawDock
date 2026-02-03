# Snapshot/Restore System PRD

**Product Requirements Document**  
**Version**: 1.0  
**Date**: 2026-02-03  
**Phase**: 1 (Core Loop MVP)

---

## 1. Overview

### 1.1 Purpose

The Snapshot/Restore System provides backup and recovery capabilities for an Agent's entire state. It protects against:

- Corrupted REFLECTION.md or other agent files
- Bad compose changes breaking the stack
- Accidental deletions
- Failed upgrades or experiments

### 1.2 Design Philosophy

**Git-based snapshots** - The Agent's directory is the unit of backup. Using git provides:
- Incremental storage (only changed files)
- Built-in history and diff
- Easy rollback to any point
- Human-readable audit trail
- No additional infrastructure

### 1.3 Success Criteria

- [ ] Automatic snapshots on configurable schedule
- [ ] Manual snapshot trigger via Gateway UI
- [ ] List all snapshots with timestamps and comments
- [ ] Restore to any previous snapshot
- [ ] Preview diff before restore
- [ ] Database backup included

---

## 2. Architecture

### 2.1 Scope of Snapshots

A snapshot captures the entire Agent Universe:

```
./data/{AgentName}/
├── docker-compose.yml     ✓ Included
├── .env                   ✓ Included (encrypted)
├── config/                ✓ Included
├── agents/                ✓ Included
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── GOALS.md
│   └── REFLECTION.md
├── workspace/             ✓ Included
│   ├── inbox/
│   ├── drafts/
│   ├── outputs/
│   └── apps/
└── data/                  ⚠️ Partial
    ├── db/                → Separate pg_dump
    └── files/             ✓ Included
```

### 2.2 What's NOT Included

- Container images (pulled from registries)
- Container runtime state (ephemeral)
- Log files (can be configured)
- Node modules / build artifacts

### 2.3 Component Location

The Snapshot System is **part of the Gateway** (not a separate container). It's exposed as tRPC procedures and has a dedicated UI section.

---

## 3. Technical Design

### 3.1 Git Repository Structure

```
./data/{AgentName}/
├── .git/                  # Snapshot history
├── .gitignore             # Exclude patterns
├── .snapshots/            # Metadata
│   └── manifest.json      # Snapshot registry
└── [agent files]
```

**.gitignore**:
```
# Exclude from snapshots
node_modules/
*.log
.DS_Store
data/db/*.pid
data/db/pg_log/

# Large files handled separately
data/db/base/

# Include .env (will be encrypted in commit)
!.env
```

### 3.2 Snapshot Manifest

```json
{
  "snapshots": [
    {
      "id": "abc123",
      "commitHash": "a1b2c3d4e5f6",
      "timestamp": "2026-02-03T10:30:00Z",
      "type": "auto",
      "trigger": "scheduled",
      "comment": "Daily automatic snapshot",
      "files": 142,
      "size": "2.4MB",
      "dbSnapshot": "db-abc123.sql.gz"
    }
  ],
  "settings": {
    "autoSnapshotInterval": "daily",
    "maxSnapshots": 30,
    "encryptSecrets": true
  }
}
```

### 3.3 Database Handling

Postgres data lives in `data/db/` but binary files don't git well. Strategy:

1. **Before snapshot**: Run `pg_dump` to create SQL backup
2. **Store as**: `data/db-backups/{snapshot-id}.sql.gz`
3. **On restore**: Stop Postgres, restore from SQL dump, restart

```typescript
async function snapshotDatabase(snapshotId: string): Promise<string> {
  const backupPath = `data/db-backups/${snapshotId}.sql.gz`;
  
  await exec(`pg_dump -h postgres -U clawdock clawdock | gzip > ${backupPath}`);
  
  return backupPath;
}

async function restoreDatabase(snapshotId: string): Promise<void> {
  const backupPath = `data/db-backups/${snapshotId}.sql.gz`;
  
  // Stop services that use the database
  await compose.stop(['gateway']);
  
  // Drop and recreate
  await exec(`dropdb -h postgres -U clawdock clawdock`);
  await exec(`createdb -h postgres -U clawdock clawdock`);
  await exec(`gunzip -c ${backupPath} | psql -h postgres -U clawdock clawdock`);
  
  // Restart services
  await compose.start(['gateway']);
}
```

### 3.4 Secret Handling

`.env` files contain secrets. Options:

1. **Exclude from git** - Simplest, but secrets not backed up
2. **Encrypt before commit** - Using age or similar
3. **External secret store** - Overkill for Phase 1

**Recommendation**: Encrypt with age using a master key stored outside the repo.

```typescript
import { execSync } from 'child_process';

const MASTER_KEY = process.env.SNAPSHOT_MASTER_KEY;

async function encryptSecrets(): Promise<void> {
  execSync(`age -e -p -o .env.age .env`, { 
    input: MASTER_KEY 
  });
  // .env.age gets committed, .env stays in .gitignore
}

async function decryptSecrets(): Promise<void> {
  execSync(`age -d -i ${keyfile} -o .env .env.age`);
}
```

---

## 4. API Specification

### 4.1 tRPC Router

```typescript
export const snapshotRouter = router({
  // List all snapshots
  list: publicProcedure
    .query(async () => {
      const manifest = await readManifest();
      return manifest.snapshots;
    }),

  // Get snapshot details
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const manifest = await readManifest();
      return manifest.snapshots.find(s => s.id === input.id);
    }),

  // Create manual snapshot
  create: publicProcedure
    .input(z.object({ 
      comment: z.string().optional() 
    }))
    .mutation(async ({ input }) => {
      return await createSnapshot({
        type: 'manual',
        comment: input.comment || 'Manual snapshot',
      });
    }),

  // Preview restore (diff)
  previewRestore: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return await getSnapshotDiff(input.id);
    }),

  // Restore to snapshot
  restore: publicProcedure
    .input(z.object({ 
      id: z.string(),
      includeDatabase: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return await restoreSnapshot(input.id, {
        includeDatabase: input.includeDatabase,
      });
    }),

  // Delete old snapshots
  prune: publicProcedure
    .input(z.object({ 
      keepLast: z.number().default(10) 
    }))
    .mutation(async ({ input }) => {
      return await pruneSnapshots(input.keepLast);
    }),

  // Get settings
  getSettings: publicProcedure
    .query(async () => {
      const manifest = await readManifest();
      return manifest.settings;
    }),

  // Update settings
  updateSettings: publicProcedure
    .input(z.object({
      autoSnapshotInterval: z.enum(['hourly', 'daily', 'weekly', 'disabled']),
      maxSnapshots: z.number().min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      return await updateSettings(input);
    }),
});
```

### 4.2 Core Functions

```typescript
interface SnapshotOptions {
  type: 'auto' | 'manual' | 'pre-change';
  trigger?: string;
  comment?: string;
}

async function createSnapshot(options: SnapshotOptions): Promise<Snapshot> {
  const snapshotId = generateId();
  
  // 1. Backup database
  const dbBackupPath = await snapshotDatabase(snapshotId);
  
  // 2. Encrypt secrets if present
  if (await fileExists('.env')) {
    await encryptSecrets();
  }
  
  // 3. Stage all changes
  await git.add('.');
  
  // 4. Create commit
  const commitMessage = `[${options.type}] ${options.comment || 'Snapshot'}`;
  const commit = await git.commit(commitMessage);
  
  // 5. Tag with snapshot ID
  await git.tag(`snapshot-${snapshotId}`);
  
  // 6. Update manifest
  const snapshot: Snapshot = {
    id: snapshotId,
    commitHash: commit.hash,
    timestamp: new Date().toISOString(),
    type: options.type,
    trigger: options.trigger,
    comment: options.comment,
    files: await countChangedFiles(),
    size: await calculateSize(),
    dbSnapshot: dbBackupPath,
  };
  
  await addToManifest(snapshot);
  
  return snapshot;
}

async function restoreSnapshot(
  snapshotId: string, 
  options: { includeDatabase: boolean }
): Promise<void> {
  const snapshot = await getSnapshot(snapshotId);
  
  // 1. Create pre-restore snapshot (safety net)
  await createSnapshot({
    type: 'pre-change',
    comment: `Before restore to ${snapshotId}`,
  });
  
  // 2. Checkout the snapshot commit
  await git.checkout(snapshot.commitHash);
  
  // 3. Decrypt secrets
  if (await fileExists('.env.age')) {
    await decryptSecrets();
  }
  
  // 4. Restore database if requested
  if (options.includeDatabase && snapshot.dbSnapshot) {
    await restoreDatabase(snapshotId);
  }
  
  // 5. Restart affected services
  await compose.restart(['gateway']);
}

async function getSnapshotDiff(snapshotId: string): Promise<DiffResult> {
  const snapshot = await getSnapshot(snapshotId);
  
  const diff = await git.diff(snapshot.commitHash, 'HEAD');
  
  return {
    filesChanged: diff.files.length,
    additions: diff.additions,
    deletions: diff.deletions,
    files: diff.files.map(f => ({
      path: f.path,
      status: f.status, // 'added' | 'modified' | 'deleted'
      diff: f.diff,
    })),
  };
}
```

---

## 5. Automatic Snapshots

### 5.1 Trigger Points

| Trigger | When | Comment |
|---------|------|---------|
| **Scheduled** | Daily at 3am (configurable) | "Daily automatic snapshot" |
| **Pre-compose** | Before docker-compose changes | "Before compose update" |
| **Pre-file-edit** | Before agent file edits (SOUL.md, etc.) | "Before editing SOUL.md" |
| **Manual** | User-triggered | User-provided comment |

### 5.2 Scheduler Implementation

```typescript
// Using node-cron or similar
import cron from 'node-cron';

function initializeAutoSnapshots(settings: SnapshotSettings) {
  if (settings.autoSnapshotInterval === 'disabled') return;
  
  const cronExpression = {
    'hourly': '0 * * * *',
    'daily': '0 3 * * *',
    'weekly': '0 3 * * 0',
  }[settings.autoSnapshotInterval];
  
  cron.schedule(cronExpression, async () => {
    await createSnapshot({
      type: 'auto',
      trigger: 'scheduled',
      comment: `${settings.autoSnapshotInterval} automatic snapshot`,
    });
    
    // Prune old snapshots
    await pruneSnapshots(settings.maxSnapshots);
  });
}
```

### 5.3 Pre-Change Snapshots

Integrated into Gateway operations:

```typescript
// In compose editor
async function updateCompose(newContent: string) {
  // Snapshot before change
  await createSnapshot({
    type: 'pre-change',
    comment: 'Before compose update',
  });
  
  // Apply change
  await writeCompose(newContent);
  await compose.up();
}

// In agent file editor
async function updateAgentFile(file: string, content: string) {
  await createSnapshot({
    type: 'pre-change',
    comment: `Before editing ${file}`,
  });
  
  await writeFile(file, content);
}
```

---

## 6. UI Design

### 6.1 Snapshot List View

```
+----------------------------------------------------------+
|  Snapshots                              [Create Snapshot] |
+----------------------------------------------------------+
| Filter: [All ▼]                         Search: [_______] |
+----------------------------------------------------------+
| ● Feb 3, 2026 10:30 AM                                    |
|   Daily automatic snapshot                                |
|   auto | 142 files | 2.4 MB                    [Restore] |
+----------------------------------------------------------+
| ○ Feb 3, 2026 09:15 AM                                    |
|   Before editing SOUL.md                                  |
|   pre-change | 1 file | 12 KB               [Restore]    |
+----------------------------------------------------------+
| ○ Feb 2, 2026 03:00 AM                                    |
|   Daily automatic snapshot                                |
|   auto | 156 files | 2.5 MB                    [Restore] |
+----------------------------------------------------------+
```

### 6.2 Restore Preview

```
+----------------------------------------------------------+
|  Restore to: Feb 3, 2026 09:15 AM                   [X]  |
+----------------------------------------------------------+
|                                                           |
|  This will restore 3 files to their previous state:       |
|                                                           |
|  Modified:                                                |
|    agents/SOUL.md                         [View Diff]     |
|                                                           |
|  Added (will be removed):                                 |
|    workspace/drafts/new-feature.md        [View Diff]     |
|                                                           |
|  Deleted (will be restored):                              |
|    config/old-setting.yml                 [View Diff]     |
|                                                           |
|  Database:                                                |
|  [✓] Include database restore                             |
|  ⚠️  This will replace current database contents          |
|                                                           |
|                    [Cancel]  [Restore Now]                |
+----------------------------------------------------------+
```

### 6.3 Settings Panel

```
+----------------------------------------------------------+
|  Snapshot Settings                                        |
+----------------------------------------------------------+
|                                                           |
|  Automatic Snapshots                                      |
|  [Daily ▼] at [03:00 ▼]                                  |
|                                                           |
|  Retention                                                |
|  Keep last [30] snapshots                                 |
|                                                           |
|  Secret Encryption                                        |
|  [✓] Encrypt .env files in snapshots                     |
|                                                           |
|  Pre-Change Snapshots                                     |
|  [✓] Before compose changes                              |
|  [✓] Before agent file edits                             |
|                                                           |
|                               [Save Settings]             |
+----------------------------------------------------------+
```

---

## 7. Storage Considerations

### 7.1 Size Estimation

| Content | Typical Size |
|---------|--------------|
| Agent files | ~50 KB |
| Config | ~100 KB |
| Workspace (varies) | 1-10 MB |
| DB backup (compressed) | 1-50 MB |

**Per snapshot**: ~2-10 MB (incremental with git)  
**30 snapshots**: ~60-300 MB

### 7.2 Pruning Strategy

```typescript
async function pruneSnapshots(keepLast: number): Promise<number> {
  const manifest = await readManifest();
  const toDelete = manifest.snapshots
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(keepLast);
  
  for (const snapshot of toDelete) {
    // Remove git tag
    await git.deleteTag(`snapshot-${snapshot.id}`);
    
    // Remove DB backup file
    if (snapshot.dbSnapshot) {
      await fs.unlink(snapshot.dbSnapshot);
    }
  }
  
  // Update manifest
  manifest.snapshots = manifest.snapshots.slice(0, keepLast);
  await writeManifest(manifest);
  
  // Git garbage collection
  await git.gc();
  
  return toDelete.length;
}
```

---

## 8. Error Handling

### 8.1 Failure Scenarios

| Scenario | Handling |
|----------|----------|
| Git operation fails | Rollback, log error, alert user |
| DB backup fails | Snapshot without DB, warn user |
| Disk full | Prevent snapshot, suggest pruning |
| Restore fails mid-way | Pre-restore snapshot exists, guide recovery |
| Encrypted secrets can't decrypt | Prompt for master key |

### 8.2 Recovery Mode

If Gateway can't start due to corrupted state:

```bash
# Manual recovery script
./scripts/emergency-restore.sh <snapshot-id>
```

This bypasses the Gateway and directly:
1. Checks out the git snapshot
2. Restores database from backup
3. Restarts docker-compose

---

## 9. Dependencies

**Install via CLI to ensure latest versions:**

```bash
pnpm add simple-git age-encryption node-cron
```

**System requirements**:
- `git` installed in Gateway container
- `pg_dump` / `psql` for database operations
- `age` for secret encryption (or gpg)

---

## 10. Implementation Tasks

1. [ ] Initialize git repo in agent directory
2. [ ] Create .gitignore with proper exclusions
3. [ ] Implement createSnapshot function
4. [ ] Implement restoreSnapshot function
5. [ ] Implement getSnapshotDiff function
6. [ ] Set up database backup/restore
7. [ ] Implement secret encryption
8. [ ] Create tRPC router
9. [ ] Build snapshot list UI
10. [ ] Build restore preview UI
11. [ ] Build settings panel
12. [ ] Integrate pre-change snapshots into Gateway operations
13. [ ] Set up automatic snapshot scheduler
14. [ ] Create emergency recovery script

---

## 11. Testing Strategy

### 11.1 Unit Tests

- Git operations (mock simple-git)
- Manifest manipulation
- Pruning logic

### 11.2 Integration Tests

- Full snapshot/restore cycle
- Database backup/restore
- Secret encryption/decryption

### 11.3 E2E Tests

- Create snapshot via UI
- Restore and verify file state
- Verify services restart correctly

---

## 12. Open Questions

1. **Git vs tar archives**: Git chosen for incremental storage and built-in diffing. Should we offer tar as alternative for simpler deployments?

2. **Remote backup**: Phase 1 is local-only. Should we add S3/B2 upload in Phase 2?

3. **Snapshot size limits**: Should we prevent snapshots if workspace grows too large? (e.g., > 1GB)

4. **Cross-version restore**: If schema changes between versions, how do we handle DB restore?

---

## 13. References

- [VISION.md Section 5.8](../../../../VISION.md) - Snapshot/Restore concept
- [simple-git documentation](https://github.com/steveukx/git-js)
- [age encryption](https://github.com/FiloSottile/age)
