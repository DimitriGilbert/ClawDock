# Docker SDK Research for ClawDock Gateway

*Research Date: 2026-02-03*

---

## 1. Problem Statement

ClawDock's Gateway needs to manage its own Docker stack programmatically:

- Read/modify `docker-compose.yml` files
- Start/stop/restart services
- Add/remove services dynamically
- Monitor container health and logs
- Build and pull images

This is critical infrastructure—the Gateway is the control plane for the Agent's Castle.

---

## 2. Existing Solutions

### 2.1 Core Library: dockerode

**Repository**: [apocas/dockerode](https://github.com/apocas/dockerode)  
**Installation**: `pnpm add dockerode && pnpm add -D @types/dockerode`

Dockerode is the de-facto standard for Docker API access in Node.js. It provides low-level access to the Docker Engine API via Unix socket.

**Key Capabilities**:
- Container lifecycle (create, start, stop, remove)
- Image management (pull, build, push)
- Network and volume management
- Event streaming and log streaming
- Stats monitoring

**Important Limitation**: Dockerode does NOT understand docker-compose files. It operates at the container level, not the stack level.

### 2.2 Docker Compose CLI Wrapper: docker-compose (npm)

**Package**: [docker-compose](https://www.npmjs.com/package/docker-compose)  
**Installation**: `pnpm add docker-compose`

A Node.js wrapper around the Docker Compose CLI. This is the simplest way to manage compose stacks.

```typescript
import * as compose from 'docker-compose';
import path from 'path';

// Start all services
await compose.upAll({ 
  cwd: path.join(__dirname, 'stacks', 'my-agent'),
  log: true 
});

// Restart a specific service
await compose.restartOne('gateway', { 
  cwd: path.join(__dirname, 'stacks', 'my-agent') 
});

// Stop everything
await compose.down({ cwd: stackPath });
```

**Pros**:
- Simple API matching compose commands
- Leverages Docker's own compose implementation
- Handles all the complexity of service dependencies

**Cons**:
- Requires Docker Compose CLI to be installed
- Less fine-grained control than dockerode
- Spawns child processes

### 2.3 YAML Manipulation: yaml (npm)

**Package**: [yaml](https://www.npmjs.com/package/yaml)  
**Installation**: `pnpm add yaml`

The modern choice for YAML parsing/manipulation. **Critical advantage**: preserves comments and formatting (round-tripping).

```typescript
import { parseDocument } from 'yaml';
import fs from 'fs';

// Read and parse
const file = fs.readFileSync('./docker-compose.yml', 'utf8');
const doc = parseDocument(file);

// Modify specific values (preserves comments!)
doc.setIn(['services', 'web', 'image'], 'my-app:v2.0.0');
doc.setIn(['services', 'web', 'environment', 'NODE_ENV'], 'production');

// Add a new service
doc.setIn(['services', 'newservice'], {
  image: 'redis:alpine',
  restart: 'unless-stopped'
});

// Write back
fs.writeFileSync('./docker-compose.yml', doc.toString());
```

**Why `yaml` over `js-yaml`**:
| Feature | `js-yaml` | `yaml` |
|---------|-----------|--------|
| Comment preservation | No | **Yes** |
| YAML 1.1 support | No (strict 1.2) | Yes (configurable) |
| Round-tripping | No | **Yes** |
| Best for | Read-only | **Editing** |

### 2.4 Schema Validation: ajv + compose-spec

**Packages**: 
- `pnpm add ajv ajv-formats`
- Schema: [compose-spec/compose-spec](https://github.com/compose-spec/compose-spec/blob/master/schema/compose-spec.json)

Validate compose files before applying them:

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Load schema (bundle locally in production)
const schema = await fetch('https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json')
  .then(r => r.json());

const validate = ajv.compile(schema);
const valid = validate(parsedYamlObject);

if (!valid) {
  console.error('Invalid compose file:', validate.errors);
}
```

### 2.5 Reference Implementation: Dockge

**Repository**: [louislam/dockge](https://github.com/louislam/dockge)  
**Tech Stack**: Node.js, TypeScript, Vue, Socket.IO

Dockge is an excellent reference for how to build a compose management UI. Key insights from their `backend/stack.ts`:

**Architecture Pattern**:
```typescript
class Stack {
  name: string;
  protected _composeYAML?: string;
  protected _composeENV?: string;
  
  // Stacks are stored as directories with compose.yaml files
  get path(): string {
    return path.join(this.server.stacksDir, this.name);
  }
  
  // Validation using yaml package
  validate() {
    yaml.parse(this.composeYAML); // Throws on invalid YAML
  }
  
  // Execute compose commands via child_process
  async deploy(socket: DockgeSocket) {
    await Terminal.exec(
      this.server, socket, terminalName,
      "docker", this.getComposeOptions("up", "-d", "--remove-orphans"),
      this.path
    );
  }
}
```

**Key Dockge Patterns**:
1. **File-based storage**: Each stack is a directory with `compose.yaml` and `.env`
2. **CLI wrapper**: Uses `docker compose` CLI via child_process, not dockerode for compose operations
3. **Status via CLI**: Gets stack status from `docker compose ls --all --format json`
4. **Real-time logs**: Uses pty terminals for interactive output
5. **YAML parsing**: Uses the `yaml` package for validation and manipulation

### 2.6 Other Tools Reviewed

| Tool | Tech | Approach | Notes |
|------|------|----------|-------|
| **Portainer** | Go + Angular | Docker API + Custom Stacks DB | Enterprise-grade, complex |
| **Yacht** | Node.js + Vue | Templates + dockerode | Template-focused, simpler |
| **Dockge** | Node.js + Vue | Compose files on disk | Best reference for our use case |
| **CasaOS** | Go + Node.js | App store abstraction | Too opinionated |

---

## 3. Recommendation

### CRITICAL UPDATE: Containerized Environment Constraint

**The Gateway runs inside a Docker container.** This means:

1. **NO access to host CLI** - The `docker-compose` npm package spawns child processes that call the `docker-compose` CLI. This CLI doesn't exist inside the Gateway container (and shouldn't - we want minimal images).

2. **Docker socket IS accessible** - We mount `/var/run/docker.sock` which gives us full Docker Engine API access via dockerode.

3. **Compose files are just YAML** - We can read/write them, but we need to translate compose concepts to Docker API calls.

### Revised Strategy: Dockerode-Only Approach

Since we can't use the compose CLI, we must implement compose-like behavior using dockerode directly:

| Compose Operation | Dockerode Equivalent |
|-------------------|----------------------|
| `up -d` | Parse YAML → Create/start containers with proper config |
| `down` | Stop and remove containers by label filter |
| `restart service` | `container.restart()` |
| `logs service` | `container.logs({ follow: true })` |
| `ps` | `docker.listContainers({ filters: { label: ['com.docker.compose.project=clawthis'] } })` |

### How Compose Labels Work

When Docker Compose creates containers, it adds labels:
- `com.docker.compose.project` = project name
- `com.docker.compose.service` = service name  
- `com.docker.compose.version` = compose file version

We can use these labels with dockerode to filter and manage "our" containers:

```typescript
// Get all containers for this agent
const containers = await docker.listContainers({
  all: true,
  filters: {
    label: [`com.docker.compose.project=${agentName}`]
  }
});

// Restart a specific service
const serviceContainers = await docker.listContainers({
  filters: {
    label: [
      `com.docker.compose.project=${agentName}`,
      `com.docker.compose.service=${serviceName}`
    ]
  }
});
```

### Compose File Updates: Two-Phase Approach

When adding/removing services from docker-compose.yml:

1. **Phase 1: Edit the YAML file** - Use `yaml` package
2. **Phase 2: Sync containers** - Compare running containers with desired state, create/remove as needed

This is more complex than calling `docker-compose up -d`, but it's the only option in a containerized environment.

### Alternative: Sidecar Pattern (Considered but Rejected)

We could run a "compose sidecar" container with docker-compose installed, but this adds:
- Another container to manage
- API complexity between Gateway and sidecar
- More failure points

The dockerode-only approach is cleaner despite being more code.

### Recommended Package Stack (Updated)

**Install via CLI to ensure latest versions:**

```bash
pnpm add dockerode yaml ajv ajv-formats
pnpm add -D @types/dockerode
```

---

## 4. Implementation Notes

### 4.1 Project Structure

```
src/
├── docker/
│   ├── client.ts           # Dockerode singleton
│   ├── stack-manager.ts    # Stack operations (dockerode-based, replaces compose CLI)
│   ├── container-monitor.ts # Health/logs/stats (dockerode)
│   ├── yaml-editor.ts      # Compose file manipulation
│   ├── compose-parser.ts   # Parse compose YAML to Docker API configs
│   ├── validators.ts       # Schema validation
│   └── types.ts            # TypeScript interfaces
└── index.ts
```

### 4.2 Dockerode Singleton Pattern

```typescript
// src/docker/client.ts
import Docker from 'dockerode';

let instance: Docker | null = null;

export function getDockerClient(): Docker {
  if (!instance) {
    instance = new Docker({ socketPath: '/var/run/docker.sock' });
  }
  return instance;
}
```

### 4.3 Safe Compose File Editing

```typescript
// src/docker/yaml-editor.ts
import { parseDocument, Document } from 'yaml';
import fs from 'fs/promises';
import path from 'path';

export class ComposeEditor {
  private doc: Document;
  private filePath: string;
  
  static async load(composePath: string): Promise<ComposeEditor> {
    const content = await fs.readFile(composePath, 'utf8');
    const editor = new ComposeEditor();
    editor.doc = parseDocument(content);
    editor.filePath = composePath;
    return editor;
  }
  
  addService(name: string, config: object): void {
    this.doc.setIn(['services', name], config);
  }
  
  removeService(name: string): void {
    const services = this.doc.get('services') as any;
    if (services?.delete) {
      services.delete(name);
    }
  }
  
  updateServiceImage(serviceName: string, image: string): void {
    this.doc.setIn(['services', serviceName, 'image'], image);
  }
  
  async save(): Promise<void> {
    // Backup before save
    const backupPath = `${this.filePath}.backup.${Date.now()}`;
    await fs.copyFile(this.filePath, backupPath);
    
    await fs.writeFile(this.filePath, this.doc.toString());
  }
  
  toString(): string {
    return this.doc.toString();
  }
}
```

### 4.4 Container Health Monitoring

```typescript
// src/docker/container-monitor.ts
import Docker from 'dockerode';
import { getDockerClient } from './client';

interface ContainerHealth {
  status: 'healthy' | 'unhealthy' | 'starting' | 'none';
  failingStreak: number;
  lastOutput?: string;
}

export class ContainerMonitor {
  private docker: Docker;
  
  constructor() {
    this.docker = getDockerClient();
  }
  
  async getHealth(containerId: string): Promise<ContainerHealth> {
    const container = this.docker.getContainer(containerId);
    const data = await container.inspect();
    
    const health = data.State.Health;
    if (!health) {
      return { status: 'none', failingStreak: 0 };
    }
    
    return {
      status: health.Status as any,
      failingStreak: health.FailingStreak,
      lastOutput: health.Log?.[health.Log.length - 1]?.Output
    };
  }
  
  async streamLogs(containerId: string, onLog: (line: string) => void): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100
    });
    
    // Demux stdout/stderr
    container.modem.demuxStream(stream, {
      write: (chunk: Buffer) => onLog(chunk.toString())
    }, {
      write: (chunk: Buffer) => onLog(`[ERR] ${chunk.toString()}`)
    });
  }
  
  async subscribeToEvents(
    onEvent: (event: { action: string; container: string; status: string }) => void
  ): Promise<void> {
    const stream = await this.docker.getEvents({
      filters: {
        type: ['container'],
        event: ['die', 'health_status', 'start', 'stop', 'restart']
      }
    });
    
    stream.on('data', (chunk) => {
      const event = JSON.parse(chunk.toString());
      onEvent({
        action: event.Action,
        container: event.Actor?.Attributes?.name || event.id,
        status: event.status
      });
    });
    
    stream.on('error', (err) => {
      console.error('Docker event stream error:', err);
      // Reconnect after delay
      setTimeout(() => this.subscribeToEvents(onEvent), 5000);
    });
  }
}
```

### 4.5 Image Pull with Progress

```typescript
// src/docker/image-manager.ts
import Docker from 'dockerode';
import { getDockerClient } from './client';

interface PullProgress {
  id?: string;
  status: string;
  progress?: string;
  current?: number;
  total?: number;
}

export async function pullImage(
  repoTag: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  const docker = getDockerClient();
  
  return new Promise((resolve, reject) => {
    docker.pull(repoTag, {}, (err, stream) => {
      if (err) return reject(err);
      
      docker.modem.followProgress(
        stream,
        (err, res) => (err ? reject(err) : resolve()),
        (event) => {
          if (onProgress) {
            onProgress({
              id: event.id,
              status: event.status,
              progress: event.progress,
              current: event.progressDetail?.current,
              total: event.progressDetail?.total
            });
          }
        }
      );
    });
  });
}
```

### 4.6 Safety Patterns

#### Protected Labels Pattern
```typescript
const PROTECTION_LABEL = 'com.clawdock.protected';

async function safeRemoveContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  const data = await container.inspect();
  
  if (data.Config.Labels?.[PROTECTION_LABEL] === 'true') {
    throw new Error(`Cannot remove protected container: ${containerId}`);
  }
  
  // Stop first (no force kill)
  if (data.State.Running) {
    await container.stop();
  }
  
  await container.remove();
}
```

#### Soft Delete (Trash Can) Pattern
```typescript
async function softDeleteContainer(containerId: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const data = await container.inspect();
  const originalName = data.Name.replace('/', '');
  const trashName = `DELETED_${originalName}_${Date.now()}`;
  
  if (data.State.Running) {
    await container.stop();
  }
  
  await container.rename({ name: trashName });
  return trashName;
}
```

#### Environment Guard
```typescript
const IS_PROD = process.env.NODE_ENV === 'production';

export function assertNotProduction(operation: string): void {
  if (IS_PROD && !process.env.CLAWDOCK_ALLOW_DESTRUCTIVE) {
    throw new Error(
      `Operation "${operation}" is disabled in production. ` +
      `Set CLAWDOCK_ALLOW_DESTRUCTIVE=true to override.`
    );
  }
}
```

#### Dry Run Mode
```typescript
interface DockerOperation {
  type: 'start' | 'stop' | 'remove' | 'create';
  target: string;
  options?: object;
}

let dryRunMode = false;
const pendingOperations: DockerOperation[] = [];

export function setDryRun(enabled: boolean): void {
  dryRunMode = enabled;
}

export function getDryRunOperations(): DockerOperation[] {
  return [...pendingOperations];
}

async function executeOrLog(op: DockerOperation, execute: () => Promise<void>): Promise<void> {
  if (dryRunMode) {
    pendingOperations.push(op);
    console.log(`[DRY RUN] Would ${op.type}: ${op.target}`);
    return;
  }
  await execute();
}
```

### 4.7 Operations Decision Matrix (Updated for Containerized Gateway)

| Operation | Method | Notes |
|-----------|--------|-------|
| Start container | dockerode `container.start()` | Direct API |
| Stop container | dockerode `container.stop()` | Direct API |
| Restart container | dockerode `container.restart()` | Direct API |
| Remove container | dockerode `container.remove()` | Direct API |
| Add service | YAML edit → create container via dockerode | Must translate compose config to Docker API |
| Remove service | dockerode `container.remove()` + YAML edit | Update file after container removal |
| View logs | dockerode `container.logs()` | Real-time streaming |
| Health checks | dockerode `container.inspect()` | Direct API access |
| Resource stats | dockerode `container.stats()` | Streaming stats |
| Pull images | dockerode `docker.pull()` | Progress callbacks |
| List containers | dockerode with label filter | Filter by `com.docker.compose.project` |

**Key insight**: The compose file becomes the "desired state" and dockerode is the execution layer. No compose CLI needed.

---

## 5. Open Questions

### 5.1 Resolved

- **Which YAML library?** → `yaml` (preserves comments)
- **dockerode vs compose CLI?** → **dockerode only** (CLI not available in container)
- **How does Dockge do it?** → CLI-based, but Dockge runs on host, not in container

### 5.2 Still Open

1. **Live reload of compose changes**: When we edit compose.yaml, should we auto-restart affected services? Dockge requires manual "Update" button click.

2. **Multi-compose-file support**: Docker Compose supports `docker compose -f base.yml -f override.yml`. Do we need this for the Gateway?

3. **Secret management**: How to handle sensitive values in compose files? Options:
   - `.env` files (Dockge's approach)
   - Docker secrets
   - External secret manager

4. **Rollback mechanism**: If a compose change breaks the stack, how do we rollback? Options:
   - Git-based versioning of compose files
   - Backup files before each edit
   - Full snapshot/restore (already in VISION.md)

5. **Resource limits for Gateway**: The Gateway needs to protect itself. Should it have hardcoded resource limits that can't be removed via compose edits?

6. **Remote Docker hosts**: Currently assuming local socket. Do we need remote host support for managing multiple agents?

---

## 6. Next Steps

1. **Create `src/docker/` module** with the patterns above
2. **Build compose editor** with backup/validation
3. **Implement safety guards** (labels, dry-run)
4. **Add real-time monitoring** via dockerode events
5. **Integrate with Gateway API** (tRPC procedures)

---

## References

- [dockerode GitHub](https://github.com/apocas/dockerode)
- [docker-compose npm](https://www.npmjs.com/package/docker-compose)
- [yaml npm](https://www.npmjs.com/package/yaml)
- [Dockge Source](https://github.com/louislam/dockge) - Excellent reference implementation
- [Docker Compose Specification](https://github.com/compose-spec/compose-spec)
- [Docker Engine API](https://docs.docker.com/engine/api/)
