# Gateway PRD

**Product Requirements Document**  
**Version**: 1.0  
**Date**: 2026-02-03  
**Phase**: 1 (Core Loop MVP)

---

## 1. Overview

### 1.1 Purpose

The Gateway is ClawDock's control plane - the administrative interface for managing an Agent's Castle. It combines:

1. **Stack Management** - Programmatic control of Docker containers
2. **Dashboard UI** - Real-time visualization of system state
3. **Chat Bay** - The default interaction interface for AI conversations
4. **Configuration UI** - Edit Agent files (AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md)

### 1.2 Success Criteria (Phase 1)

- [ ] Can view all containers in the stack with health status
- [ ] Can start/stop/restart individual services
- [ ] Can add/remove services via compose file editing
- [ ] Can have streaming AI conversations via Chat Bay
- [ ] Can view and edit Agent identity files
- [ ] Real-time updates without page refresh
- [ ] Survives Gateway restart (stateless frontend, persistent backend)

### 1.3 Non-Goals (Phase 1)

- Multi-agent management (single Castle focus)
- User authentication (local-only access)
- Prompt Manager UI (API-only in Phase 1)
- Task Tracker UI (API-only in Phase 1)
- Bay configuration UI (Chat Bay only)

---

## 2. Architecture

### 2.1 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | TanStack Router | File-based routing, type-safe |
| UI Components | shadcn/ui + Tailwind | Composable, accessible |
| Backend | Hono | Lightweight, edge-ready |
| API | tRPC | End-to-end type safety |
| Reactivity | tRPC Subscriptions (SSE) | Real-time without WebSocket complexity |
| Database | Postgres + Drizzle | Shared with other services |
| Docker SDK | dockerode + docker-compose CLI | Hybrid approach per research |
| AI Streaming | Vercel AI SDK (`ai` + `@ai-sdk/react` + `ai-sdk-provider-opencode-sdk`) | Industry-standard LLM streaming via OpenCode provider |

### 2.2 Container Configuration

```yaml
services:
  gateway:
    build: ./apps/gateway
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ../agents:/agents
      - ../config:/config
      - ../workspace:/workspace
    environment:
      - DATABASE_URL=postgresql://clawdock:${DB_PASSWORD}@postgres:5432/clawdock
      - OPENCODE_URL=http://opencode:4096
      - OPENCODE_PASSWORD=${OPENCODE_PASSWORD}
    depends_on:
      - postgres
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gateway.rule=Host(`gateway.localhost`)"
      - "com.clawdock.protected=true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 2.3 Project Structure (Monorepo)

The Gateway is implemented across the existing Monorepo workspaces:

```
ClawDock/
├── apps/
│   ├── web/                  # Gateway UI (Dashboard + Chat Bay)
│   │   ├── src/
│   │   │   ├── routes/       # TanStack Router pages
│   │   │   ├── components/   # UI components
│   │   │   └── utils/        # Client-side utilities
│   │   └── ...
│   └── server/               # Gateway API (Hono entry point)
│       ├── src/
│       │   ├── docker/       # Docker SDK integration
│       │   └── index.ts      # Server entry
│       └── ...
├── packages/
│   ├── api/                  # tRPC Routers (Shared Logic)
│   │   └── src/
│   │       ├── router/
│   │       │   ├── stack.ts  # Stack management router
│   │       │   ├── chat.ts   # Chat router
│   │       │   └── root.ts   # AppRouter
│   │       └── ...
│   ├── db/                   # Drizzle Schema & Connection
│   │   └── src/
│   │       └── schema.ts     # DB tables
│   └── ...
└── ...
```

---

## 3. Features

### 3.1 Stack Management

#### 3.1.1 Container Dashboard

**Display for each container:**
- Name and image
- Status (running, stopped, restarting, unhealthy)
- Health check status (healthy, unhealthy, starting, none)
- Uptime
- Resource usage (CPU%, Memory)
- Port mappings

**Actions:**
- Start / Stop / Restart
- View logs (real-time streaming)
- Inspect (view full container details)
- Remove (with confirmation, respects protection labels)

#### 3.1.2 Compose Editor

**Capabilities:**
- View current docker-compose.yml
- Syntax-highlighted YAML editing
- Validate before save (JSON Schema validation)
- Backup before applying changes
- Apply changes (triggers compose up -d)

**Safety Features:**
- Cannot remove protected services (Gateway, Traefik, Postgres)
- Dry-run mode for testing changes
- Rollback to previous version

#### 3.1.3 Service Addition Wizard

**Flow:**
1. Choose: Add from template OR Custom YAML
2. If template: Select from catalog (Miniflux, Redis, etc.)
3. Configure service name and environment variables
4. Preview generated YAML
5. Confirm and deploy

**Templates (initial set):**
```yaml
templates:
  - name: miniflux
    description: RSS aggregator with API
    image: miniflux/miniflux:latest
    requires: [postgres]
  - name: redis
    description: In-memory cache
    image: redis:alpine
  - name: custom
    description: Custom service from image
```

### 3.2 Chat Bay

#### 3.2.1 Interface

- Full-screen chat interface
- Message history (persisted to database)
- Streaming responses (token-by-token display)
- Markdown rendering in responses
- Code blocks with syntax highlighting
- Copy message/code functionality

#### 3.2.2 Integration

**Frontend - AI SDK `useChat` Hook:**

The Chat Bay UI uses `@ai-sdk/react`'s `useChat` hook for streaming. This handles message state, streaming, and error handling out of the box.

```typescript
// apps/web/src/routes/chat.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function ChatBay() {
  const { messages, sendMessage, status, error } = useChat({
    id: sessionId, // From URL params or state
    transport: new DefaultChatTransport({
      api: '/api/chat', // Hono endpoint
    }),
  });

  return (
    <div>
      {messages.map(message => (
        <ChatMessage key={message.id} message={message} />
      ))}
      <ChatInput 
        onSend={(text) => sendMessage({ text })} 
        disabled={status !== 'ready'} 
      />
    </div>
  );
}
```

**Backend - Hono + AI SDK with OpenCode Provider:**

The backend uses the `ai-sdk-provider-opencode-sdk` package to connect to OpenCode Server:

```typescript
// apps/server/src/routes/chat.ts
import { Hono } from 'hono';
import { streamText } from 'ai';
import { createOpencode } from 'ai-sdk-provider-opencode-sdk';

// Create OpenCode provider pointing to containerized server
const opencode = createOpencode({
  baseUrl: process.env.OPENCODE_URL || 'http://opencode:4096',
  password: process.env.OPENCODE_PASSWORD,
});

export const chatRoutes = new Hono();

chatRoutes.post('/api/chat', async (c) => {
  const { messages, id: sessionId } = await c.req.json();
  
  const result = await streamText({
    model: opencode('anthropic/claude-sonnet-4-20250514'), // Or configured model
    messages,
    system: await buildSystemPrompt(sessionId), // Loads AGENTS.md, SOUL.md, etc.
  });
  
  return result.toDataStreamResponse();
});
```

**Context Injection:**
- Automatically loads AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md
- Provides workspace context
- Includes current stack state

#### 3.2.3 Session Management

- Sessions persist across page refreshes
- Session list in sidebar
- Create new session
- Delete session (with confirmation)

### 3.3 Agent File Editor

#### 3.3.1 Supported Files

| File | Location | Editable |
|------|----------|----------|
| AGENTS.md | /agents/AGENTS.md | Yes |
| SOUL.md | /agents/SOUL.md | Yes |
| GOALS.md | /agents/GOALS.md | Yes |
| REFLECTION.md | /agents/REFLECTION.md | Read-only* |

*REFLECTION.md is AI-written. Human can view but editing requires explicit unlock.

#### 3.3.2 Editor Features

- Markdown preview (side-by-side or toggle)
- Auto-save with debounce (2s delay)
- Version history (git-based)
- Syntax highlighting
- Frontmatter support (for GOALS.md priorities)

### 3.4 Real-Time Updates

#### 3.4.1 Dashboard Subscriptions

```typescript
// Stack state subscription
export const stackRouter = router({
  onContainerChange: publicProcedure
    .subscription(() => {
      return observable<ContainerEvent>((emit) => {
        const handler = (event: ContainerEvent) => emit.next(event);
        dockerEvents.on('container', handler);
        return () => dockerEvents.off('container', handler);
      });
    }),
    
  onHealthChange: publicProcedure
    .subscription(() => {
      return observable<HealthEvent>((emit) => {
        const handler = (event: HealthEvent) => emit.next(event);
        dockerEvents.on('health', handler);
        return () => dockerEvents.off('health', handler);
      });
    }),
});
```

#### 3.4.2 Log Streaming

Raw SSE endpoint for container logs (outside tRPC for simplicity):

```typescript
app.get('/api/logs/:containerId', (c) => {
  return streamSSE(c, async (stream) => {
    const containerId = c.req.param('containerId');
    await docker.streamLogs(containerId, async (line) => {
      await stream.writeSSE({ event: 'log', data: line });
    });
  });
});
```

---

## 4. Database Schema

```typescript
// drizzle/schema.ts
import { pgTable, text, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

// Chat sessions
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  metadata: jsonb('metadata'),
});

// Chat messages
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  metadata: jsonb('metadata'), // tokens, model, etc.
});

// Compose file history (for rollback)
export const composeHistory = pgTable('compose_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by'), // 'user' | 'system' | 'agent'
  comment: text('comment'),
});
```

---

## 5. API Specification

### 5.1 tRPC Routers

```typescript
// Root router composition
export const appRouter = router({
  stack: stackRouter,    // Container/compose operations
  chat: chatRouter,      // Chat Bay
  agent: agentRouter,    // Agent file operations
  health: healthRouter,  // Health checks
});

// Key procedures
stackRouter = {
  listContainers: query,
  getContainer: query,
  startContainer: mutation,
  stopContainer: mutation,
  restartContainer: mutation,
  removeContainer: mutation,
  getCompose: query,
  updateCompose: mutation,
  validateCompose: mutation,
  onContainerChange: subscription,
  onHealthChange: subscription,
}

chatRouter = {
  listSessions: query,
  getSession: query,
  createSession: mutation,
  deleteSession: mutation,
  // Note: Streaming is handled via Hono /api/chat route with AI SDK, not tRPC
}

agentRouter = {
  getFile: query,        // Get SOUL.md, GOALS.md, etc.
  updateFile: mutation,  // Save changes
  getFileHistory: query, // Git history
  revertFile: mutation,  // Revert to previous version
}
```

### 5.2 REST Endpoints (Non-tRPC)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Container health check |
| `/api/chat` | POST | AI SDK streaming chat (used by `useChat` hook) |
| `/api/logs/:id` | GET | SSE log streaming |
| `/api/trpc/*` | * | tRPC handler |

---

## 6. UI Wireframes

### 6.1 Dashboard Layout

```
+----------------------------------------------------------+
|  ClawDock Gateway                    [Agent: Clawthis]   |
+----------------------------------------------------------+
|         |                                                 |
| [Nav]   |  Stack Overview                                 |
|         |  +----------------+  +----------------+         |
| Stack   |  | gateway        |  | postgres       |         |
| Chat    |  | Running  2h    |  | Running  2h    |         |
| Agent   |  | CPU: 2% M:128M |  | CPU: 1% M:256M |         |
|         |  +----------------+  +----------------+         |
|         |                                                 |
|         |  +----------------+  +----------------+         |
|         |  | traefik        |  | opencode       |         |
|         |  | Running  2h    |  | Running  2h    |         |
|         |  | CPU: 0% M:64M  |  | CPU: 5% M:512M |         |
|         |  +----------------+  +----------------+         |
|         |                                                 |
+----------------------------------------------------------+
```

### 6.2 Chat Bay Layout

```
+----------------------------------------------------------+
|  ClawDock Gateway > Chat Bay                              |
+----------------------------------------------------------+
| Sessions |                                                |
|          |  Clawthis                                      |
| > New    |  +-----------------------------------------+   |
| Session1 |  | How can I help you today?               |   |
| Session2 |  +-----------------------------------------+   |
|          |                                                |
|          |  You                                           |
|          |  +-----------------------------------------+   |
|          |  | What services are running?              |   |
|          |  +-----------------------------------------+   |
|          |                                                |
|          |  Clawthis                                      |
|          |  +-----------------------------------------+   |
|          |  | I can see 4 services running:           |   |
|          |  | - gateway (healthy)                     |   |
|          |  | - postgres (healthy)                    |   |
|          |  | - traefik (healthy)                     |   |
|          |  | - opencode (healthy)                    |   |
|          |  +-----------------------------------------+   |
|          |                                                |
|          |  +------------------------------------------+  |
|          |  | Type your message...              [Send] |  |
|          |  +------------------------------------------+  |
+----------------------------------------------------------+
```

---

## 7. Security Considerations

### 7.1 Phase 1 Security Model

- **Local-only access**: No authentication required (trusted network)
- **Docker socket read-only**: Mounted as `:ro` where possible
- **Protected containers**: Labels prevent accidental removal
- **Input validation**: All tRPC inputs validated with Zod

### 7.2 Future Considerations (Phase 2+)

- Basic authentication (username/password)
- Session tokens
- CORS restrictions
- Rate limiting
- Audit logging

---

## 8. Dependencies

### 8.1 npm Packages

**Install via CLI to ensure latest versions:**

```bash
# Core dependencies
pnpm add hono @hono/node-server @hono/trpc-server
pnpm add @trpc/server @trpc/client @tanstack/react-router
pnpm add zod drizzle-orm postgres
pnpm add dockerode yaml ajv ajv-formats

# AI SDK (backend streaming + frontend hooks + OpenCode provider)
pnpm add ai @ai-sdk/react ai-sdk-provider-opencode-sdk

# Dev dependencies
pnpm add -D @types/dockerode drizzle-kit
```

**Note**: No `docker-compose` package - Gateway runs in container without access to host CLI. All Docker operations use dockerode directly.
```

### 8.2 External Services

| Service | Purpose | Required |
|---------|---------|----------|
| PostgreSQL | Database | Yes |
| OpenCode Server | AI inference | Yes |
| Traefik | Reverse proxy | Yes |

---

## 9. Testing Strategy

### 9.1 Unit Tests

- Docker SDK wrapper functions
- YAML manipulation
- Zod schema validation

### 9.2 Integration Tests

- tRPC router procedures
- Database operations
- Docker operations (using test containers)

### 9.3 E2E Tests

- Full flow: Start container via UI
- Full flow: Send chat message, receive response
- Full flow: Edit and save agent file

---

## 10. Implementation Strategy: Parallel Work Streams (Monorepo)

The Gateway is implemented across the existing Better-T-Stack monorepo structure.

### 10.1 Work Stream Overview

```
                    ┌─────────────────────────────────────────┐
                    │  STREAM 0: Foundation (Sequential)       │
                    │  - Verify monorepo, schema, shared types │
                    └────────────────────┬────────────────────┘
                                         │
         ┌───────────────┬───────────────┼───────────────┬───────────────┐
         ▼               ▼               ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ STREAM 1│    │ STREAM 2│    │ STREAM 3│    │ STREAM 4│    │ STREAM 5│
    │ Docker  │    │ Chat Bay│    │ Agent   │    │ UI Shell│    │ Snapshot│
    │ Module  │    │ Module  │    │ Module  │    │ (Web)   │    │ System  │
    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘
         │               │               │               │               │
         └───────────────┴───────────────┴───────────────┴───────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │  STREAM 6: Integration (Sequential)      │
                    │  - Wire streams together, E2E tests      │
                    └─────────────────────────────────────────┘
```

### 10.2 Stream 0: Foundation (Verified)

**Context**: The project is already bootstrapped with Better-T-Stack.
**Owner**: Single developer
**Duration**: ~1 hour

| Task | Location | Description |
|------|----------|-------------|
| Verify Structure | Root | Ensure `apps/web`, `apps/server`, `packages/api`, `packages/db` exist. |
| Database Schema | `packages/db/src/schema.ts` | Implement schema from `data/Clawthis/init-db.sql` using Drizzle tables. |
| Shared Types | `packages/api/src/types.ts` | Create shared type definitions (or export inferred types from Drizzle). |
| Docker Config | `docker-compose.yml` | Ensure `postgres` service is running and accessible. |

**Dependency Install**:
```bash
# Add dependencies to API package (backend)
pnpm --filter @ClawDock/api add dockerode yaml ajv ajv-formats ai ai-sdk-provider-opencode-sdk
pnpm --filter @ClawDock/api add -D @types/dockerode

# Add AI SDK React hooks to web package (frontend)
pnpm --filter @ClawDock/web add @ai-sdk/react ai
```

### 10.3 Stream 1: Docker SDK Module

**Owner**: Backend developer
**Scope**: `packages/api` & `apps/server`

| Task | Location | Description |
|------|----------|-------------|
| Docker Client | `packages/api/src/lib/docker/client.ts` | Dockerode singleton. |
| Stack Manager | `packages/api/src/lib/docker/stack.ts` | Logic for container operations (using `dockerode` directly). |
| YAML Editor | `packages/api/src/lib/docker/editor.ts` | `yaml` based compose file manipulation. |
| Stack Router | `packages/api/src/routers/stack.ts` | tRPC router exposing stack operations. |

### 10.4 Stream 2: Chat Bay Module

**Owner**: Full-stack developer
**Scope**: `packages/api` & `apps/web`

| Task | Location | Description |
|------|----------|-------------|
| OpenCode Provider Setup | `apps/server/src/lib/ai/opencode.ts` | Configure `ai-sdk-provider-opencode-sdk` with env vars. |
| Chat API Route | `apps/server/src/routes/chat.ts` | Hono route using `streamText()` with OpenCode provider. |
| Chat UI | `apps/web/src/routes/chat.tsx` | Uses `useChat` hook from `@ai-sdk/react`. |
| Chat Components | `apps/web/src/components/chat/` | Message bubbles, input area, session sidebar. |

### 10.5 Stream 3: Agent Files Module

**Owner**: Backend developer
**Scope**: `packages/api`

| Task | Location | Description |
|------|----------|-------------|
| File Manager | `packages/api/src/lib/agent/files.ts` | FS operations for `AGENTS.md`, `SOUL.md`, etc. |
| Agent Router | `packages/api/src/routers/agent.ts` | Procedures to read/write/list agent files. |

### 10.6 Stream 4: UI Shell

**Owner**: Frontend developer
**Scope**: `apps/web`

| Task | Location | Description |
|------|----------|-------------|
| Layout | `apps/web/src/routes/__root.tsx` | Navigation sidebar, responsive shell. |
| Dashboard | `apps/web/src/routes/index.tsx` | Stack overview, service cards. |
| Components | `apps/web/src/components/ui/` | Ensure shadcn components are present. |
| Theme | `apps/web/src/index.css` | Verify Tailwind config. |

### 10.7 Stream 5: Snapshot System

**Owner**: Backend developer
**Scope**: `packages/api`

| Task | Location | Description |
|------|----------|-------------|
| Git Manager | `packages/api/src/lib/snapshot/git.ts` | `simple-git` operations. |
| DB Backup | `packages/api/src/lib/snapshot/db.ts` | `pg_dump` execution. |
| Crypto | `packages/api/src/lib/snapshot/crypto.ts` | `age` encryption. |
| Snapshot Router | `packages/api/src/routers/snapshot.ts` | Snapshot/restore procedures. |

### 10.8 Stream 6: Integration

**Owner**: Lead developer

| Task | Location | Description |
|------|----------|-------------|
| Root Router | `packages/api/src/routers/index.ts` | Mount all sub-routers (`stack`, `chat`, `agent`, `snapshot`). |
| Server Entry | `apps/server/src/index.ts` | Verify tRPC context and server mounting. |
| Dockerfile | `apps/server/Dockerfile` | Create Dockerfile for the Hono server. |
| E2E Tests | `packages/api/test/` | Integration tests for routers. |

---

## 11. Type Safety Requirements

**This is non-negotiable.** Type safety is a core principle of this project.

### 11.1 TypeScript Configuration

Ensure all `tsconfig.json` files in the monorepo extend a strict base config.

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### 11.2 Forbidden Patterns

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `any` | Defeats type safety | Use `unknown` + type guards |
| `as any` | Type assertion escape hatch | Fix the underlying type |
| `: any` | Untyped parameters | Define proper types |
| `// @ts-ignore` | Hides errors | Fix the error |
| `// @ts-expect-error` | Only in tests | Use sparingly in tests only |
| `object` | Too loose | Use `Record<string, unknown>` or interface |

### 11.3 Encouraged Patterns

```typescript
// DO: Use discriminated unions
type ContainerEvent = 
  | { type: 'started'; containerId: string; timestamp: Date }
  | { type: 'stopped'; containerId: string; exitCode: number }
  | { type: 'health_changed'; containerId: string; health: HealthStatus };

// DO: Use Zod for runtime validation with inferred types
const CreateSessionSchema = z.object({
  title: z.string().optional(),
});
type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

// DO: Use branded types for IDs
type ContainerId = string & { readonly __brand: 'ContainerId' };
type SessionId = string & { readonly __brand: 'SessionId' };

// DO: Use const assertions for enums
const CONTAINER_STATUS = ['running', 'stopped', 'paused'] as const;
type ContainerStatus = typeof CONTAINER_STATUS[number];

// DO: Use satisfies for type checking without widening
const config = {
  port: 3000,
  host: 'localhost',
} satisfies ServerConfig;
```

### 11.4 Type Safety Checklist (Per Work Stream)

Before a stream is considered complete:

- [ ] `pnpm check-types` passes globally.
- [ ] No `any` in new code.
- [ ] All function parameters have explicit types.
- [ ] All return types are explicit (no inference for public APIs).
- [ ] Zod schemas used for all env vars and API inputs.
- [ ] Drizzle schemas act as the source of truth for DB types.
- [ ] tRPC procedures have full input/output types.


---

| Metric | Target |
|--------|--------|
| Container list load time | < 500ms |
| Log streaming latency | < 100ms |
| Chat response start | < 1s (first token) |
| File save confirmation | < 500ms |
| Real-time update latency | < 200ms |

---

## 12. Open Questions

1. **Session storage**: Should chat sessions be per-agent or per-Castle? (Leaning: per-agent, stored in agent's database)

2. **OpenCode authentication**: How to securely pass credentials between Gateway and OpenCode Server?

3. **Multi-file compose**: Support docker-compose.override.yml?

4. **Compose lock**: Prevent concurrent edits to compose file?

---

## 13. References

- [docs/research/docker-sdk.md](research/docker-sdk.md) - Docker SDK patterns
- [docs/research/gateway-reactivity.md](research/gateway-reactivity.md) - Reactivity approach
- [VISION.md](../VISION.md) - Overall architecture
