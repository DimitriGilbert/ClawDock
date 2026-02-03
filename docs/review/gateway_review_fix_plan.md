# Gateway Review Fix Plan

## Executive Summary

The Gateway implementation has **strong architectural foundations** with excellent type safety practices, but contains **critical integration gaps** that prevent deployment. After reviewing 11 detailed review files across both Clawthis and Gemini review streams, the following pattern emerges:

- **Backend modules** (Docker, Agent Files): Well-implemented with good type safety
- **Integration points**: Critical failures - routes not mounted, endpoints not wired
- **Frontend UI**: Major gaps - Chat Bay and Agent Files UI completely missing
- **Type safety**: One blocking error affecting entire monorepo
- **Security**: Path traversal and protection checks missing

**Estimated effort to production-ready**: 16-24 hours of focused work

---

## Critical Issues (Must Fix First)

These issues **block compilation, deployment, or basic functionality**:

### 1. TypeScript Compilation Failure
**Severity**: CRITICAL  
**Files**: `packages/api/src/context.ts:7`  
**Issue**: Unused `context` parameter causes TS6133 error, blocking entire build  
**Fix**:
```typescript
// Change from:
export async function createContext({ context }: CreateContextOptions)
// To:
export async function createContext({ context: _context }: CreateContextOptions)
// Or:
export async function createContext(_opts: CreateContextOptions)
```
**Effort**: 5 minutes

### 2. Chat Router Not Mounted (tRPC)
**Severity**: CRITICAL  
**Files**: `packages/api/src/routers/index.ts`  
**Issue**: `chatRouter` exists but is not included in `appRouter`  
**Fix**:
```typescript
import { chatRouter } from "./chat";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  agent: agentRouter,
  stack: stackRouter,
  chat: chatRouter, // ADD THIS
});
```
**Effort**: 10 minutes

### 3. Chat Hono Route Not Mounted
**Severity**: CRITICAL  
**Files**: `apps/server/src/index.ts`  
**Issue**: `/api/chat` endpoint defined but never mounted to main Hono app  
**Fix**:
```typescript
import { chatRoutes } from "./routes/chat";

// Add after tRPC handler:
app.route("/", chatRoutes);
```
**Effort**: 10 minutes

### 4. Frontend Chat UI Missing
**Severity**: CRITICAL  
**Files**: `apps/web/src/routes/chat.tsx` (does not exist)  
**Issue**: No chat interface despite `@ai-sdk/react` being installed  
**Requirements**:
- Create chat route component
- Implement `useChat` hook from `@ai-sdk/react`
- Build message list, input area, session sidebar
- Connect to `/api/chat` endpoint
**Effort**: 4-6 hours

### 5. Frontend Agent Files Editor Missing
**Severity**: CRITICAL  
**Files**: `apps/web/src/routes/files.tsx` (does not exist)  
**Issue**: No Agent Files editing interface  
**Requirements**:
- File list (AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md)
- Markdown editor with syntax highlighting
- Side-by-side preview
- Version history and revert buttons
**Effort**: 3-4 hours

### 6. Assistant Messages Not Persisted
**Severity**: CRITICAL  
**Files**: `apps/server/src/routes/chat.ts`  
**Issue**: User messages saved to DB, but AI responses stream directly to client without persistence  
**Fix**: Use `onFinish` callback in `streamText` to save assistant response:
```typescript
const result = streamText({
  // ... config
  onFinish: async (result) => {
    await db.insert(chatMessages).values({
      sessionId: validSessionId,
      role: "assistant",
      content: result.text,
    });
  },
});
```
**Effort**: 1-2 hours

### 7. Auto-Session Creation Missing
**Severity**: CRITICAL  
**Files**: `apps/server/src/routes/chat.ts`  
**Issue**: Chat requires `sessionId` but no automatic session creation exists  
**Fix**: Create session if not provided:
```typescript
let validSessionId = sessionId;
if (!validSessionId) {
  const [session] = await db.insert(chatSessions)
    .values({ title: "New Chat" })
    .returning();
  validSessionId = session.id;
}
```
**Effort**: 30 minutes

### 8. Missing `/health` Endpoint
**Severity**: CRITICAL  
**Files**: `apps/server/src/index.ts`  
**Issue**: Docker health checks require REST endpoint, only tRPC query exists  
**Fix**:
```typescript
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});
```
**Effort**: 10 minutes

### 9. Wrong tRPC Route Pattern
**Severity**: CRITICAL  
**Files**: `apps/server/src/index.ts:21`  
**Issue**: Current `/trpc/*`, required `/api/trpc/*` per PRD  
**Fix**: Change route pattern from `/trpc/*` to `/api/trpc/*`
**Effort**: 5 minutes

### 10. No Dockerfile
**Severity**: CRITICAL  
**Files**: `apps/server/Dockerfile` (does not exist)  
**Issue**: Cannot deploy to container without Dockerfile  
**Requirements**:
- Multi-stage build
- Node 20 Alpine base
- pnpm for package management
- Health check configuration
**Effort**: 30 minutes

### 11. Snapshot Router Missing
**Severity**: CRITICAL  
**Files**: `packages/api/src/routers/index.ts`  
**Issue**: Schema exists but no router implementation  
**Fix**: Add snapshot router to appRouter
**Effort**: 30 minutes

---

## High Priority Issues

### Docker/Stack Module

#### 12. Protected Container Handling Missing
**Severity**: HIGH  
**Files**: `packages/api/src/lib/docker/stack.ts`  
**Issue**: No checks for `com.clawdock.protected` label  
**Impact**: Gateway, Traefik, Postgres could be accidentally removed  
**Fix**:
```typescript
const PROTECTED_CONTAINERS = ["gateway", "traefik", "postgres"];

export async function removeContainer(id: string) {
  const container = await getContainer(id);
  const isProtected = container.labels.some(
    label => label.key === "com.clawdock.protected" && label.value === "true"
  );
  if (isProtected) {
    return { success: false, error: "Cannot remove protected container" };
  }
  // ... proceed
}
```
**Effort**: 2-3 hours

#### 13. Remove Container Procedure Missing
**Severity**: HIGH  
**Files**: `packages/api/src/routers/stack.ts`  
**Issue**: PRD requires `removeContainer` but not implemented  
**Fix**: Add tRPC mutation for container removal with protected checks
**Effort**: 1 hour

#### 14. Path Traversal Vulnerability
**Severity**: HIGH  
**Files**: `packages/api/src/lib/docker/editor.ts:339-342`  
**Issue**: `readComposeFile` accepts any file path without validation  
**Fix**: Add path validation:
```typescript
import path from "path";

const ALLOWED_BASE_DIRS = [process.cwd(), process.env["AGENT_DATA_PATH"]].filter(Boolean);

function validateFilePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const isAllowed = ALLOWED_BASE_DIRS.some(base => 
    resolved.startsWith(path.resolve(base))
  );
  if (!isAllowed) {
    throw new Error("Access denied: file path outside allowed directories");
  }
}
```
**Effort**: 2-3 hours

#### 15. No Compose File Locking
**Severity**: HIGH  
**Files**: `packages/api/src/lib/docker/editor.ts`  
**Issue**: Concurrent edits could corrupt compose file  
**Fix**: Implement file-based locking mechanism
**Effort**: 4-6 hours

#### 16. Log Streaming Endpoint Missing
**Severity**: HIGH  
**Files**: New file needed: `packages/api/src/lib/docker/logs.ts`  
**Issue**: PRD Section 3.4.2 requires `/api/logs/:containerId` SSE endpoint  
**Fix**: Implement Docker logs streaming via SSE
**Effort**: 3-4 hours

#### 17. Resource Stats Missing
**Severity**: HIGH  
**Files**: `packages/api/src/lib/docker/stats.ts` (new file)  
**Issue**: CPU%, Memory usage not available for containers  
**Fix**: Implement Docker stats collection
**Effort**: 4-5 hours

### Chat Module

#### 18. N+1 Query Problem
**Severity**: HIGH  
**Files**: `packages/api/src/routers/chat.ts:46-64`  
**Issue**: Separate query for each session to count messages  
**Fix**: Use aggregation query:
```typescript
const sessionsWithCount = await db
  .select({
    id: chatSessions.id,
    messageCount: sql<number>`count(${chatMessages.id})::int`,
  })
  .from(chatSessions)
  .leftJoin(chatMessages, eq(chatSessions.id, chatMessages.sessionId))
  .groupBy(chatSessions.id);
```
**Effort**: 30 minutes

#### 19. Input Validation Gaps
**Severity**: HIGH  
**Files**: `apps/server/src/routes/chat.ts`  
**Issue**: No content length limits, no sanitization  
**Fix**:
```typescript
const ContentSchema = z.string().max(100_000); // 100KB limit
```
**Effort**: 30 minutes

### UI Shell

#### 20. Dashboard Uses Mock Data
**Severity**: HIGH  
**Files**: `apps/web/src/routes/index.tsx`  
**Issue**: `MOCK_CONTAINERS` instead of real tRPC data  
**Fix**: Replace with `trpc.stack.listContainers.useQuery()`
**Effort**: 1 hour

#### 21. Missing Container Actions
**Severity**: HIGH  
**Files**: `apps/web/src/routes/index.tsx`  
**Issue**: No Start/Stop/Restart buttons on container cards  
**Fix**: Add action buttons using tRPC mutations
**Effort**: 1-2 hours

#### 22. Missing Real-Time Subscriptions
**Severity**: HIGH  
**Files**: `apps/web/src/routes/index.tsx`  
**Issue**: Container changes not reflected in real-time  
**Fix**: Implement `trpc.stack.onContainerChange.useSubscription()`
**Effort**: 2 hours

### Integration/Server

#### 23. No Error Handling Middleware
**Severity**: HIGH  
**Files**: `apps/server/src/index.ts`  
**Issue**: No global error handler for consistent error responses  
**Fix**: Add Hono error middleware
**Effort**: 30 minutes

---

## Medium Priority Issues

### Docker Module

#### 24. Event Stream Cleanup
**Severity**: MEDIUM  
**Files**: `packages/api/src/lib/docker/stack.ts:646-736`  
**Issue**: Only tracks one global stream, no process shutdown cleanup  
**Fix**: Track multiple subscriptions, add shutdown handlers
**Effort**: 2-3 hours

#### 25. Backup File Accumulation
**Severity**: MEDIUM  
**Files**: `packages/api/src/lib/docker/editor.ts`  
**Issue**: `updateComposeFile` creates backups without cleanup  
**Fix**: Limit backup history (last 10), add cleanup API
**Effort**: 2-3 hours

#### 26. Unknown Types in HostConfig
**Severity**: MEDIUM  
**Files**: `packages/api/src/lib/docker/types.ts:142-146`  
**Issue**: `unknown[]` for complex nested types loses type information  
**Fix**: Define proper interfaces for Docker structures
**Effort**: 1 hour

### Chat Module

#### 27. Error Handling Improvements
**Severity**: MEDIUM  
**Files**: `apps/server/src/routes/chat.ts:84-89`  
**Issue**: Generic error messages, no error type distinction  
**Fix**: Distinguish ZodError, connection errors, etc.
**Effort**: 1 hour

#### 28. Message Ordering Inefficiency
**Severity**: MEDIUM  
**Files**: `packages/api/src/routers/chat.ts:118-126`  
**Issue**: Fetches DESC then reverses in JS  
**Fix**: Use ASC directly in query
**Effort**: 15 minutes

#### 29. No Message Metadata Capture
**Severity**: MEDIUM  
**Files**: `apps/server/src/routes/chat.ts`  
**Issue**: Model, token counts not stored  
**Fix**: Capture and store metadata in `onFinish` callback
**Effort**: 30 minutes

### Agent Files

#### 30. No Git Repository Check
**Severity**: MEDIUM  
**Files**: `packages/api/src/lib/agent/files.ts`  
**Issue**: No validation that git repository exists  
**Fix**: Add git repository validation on startup
**Effort**: 30 minutes

#### 31. REFLECTION.md Unlock Mechanism
**Severity**: MEDIUM  
**Files**: `packages/api/src/lib/agent/files.ts`  
**Issue**: Error message mentions "explicit unlock" but no API exists  
**Fix**: Add `unlockReflectionFile()` mutation
**Effort**: 1 hour

#### 32. AGENTS_DIR Hardcoded
**Severity**: MEDIUM  
**Files**: `packages/api/src/lib/agent/files.ts`  
**Issue**: Path hardcoded to 'Clawthis', should be configurable  
**Fix**: Move to environment variable
**Effort**: 30 minutes

### UI Shell

#### 33. No Responsive Sidebar
**Severity**: MEDIUM  
**Files**: `apps/web/src/components/layout/Sidebar.tsx`  
**Issue**: Fixed width, no mobile collapse  
**Fix**: Add hamburger menu, responsive breakpoints
**Effort**: 2-3 hours

#### 34. Accessibility Gaps
**Severity**: MEDIUM  
**Files**: Multiple UI files  
**Issues**:
- Status indicators lack ARIA labels
- Navigation links missing `aria-current`
- No skip-to-content link
**Effort**: 2 hours

#### 35. No Error Boundaries
**Severity**: MEDIUM  
**Files**: `apps/web/src/routes/`  
**Issue**: No error handling for route failures  
**Fix**: Add React error boundaries
**Effort**: 1-2 hours

### Integration

#### 36. No Graceful Shutdown
**Severity**: MEDIUM  
**Files**: `apps/server/src/index.ts`  
**Issue**: Server doesn't handle SIGTERM properly  
**Fix**: Add process signal handlers
**Effort**: 30 minutes

#### 37. Hardcoded Port
**Severity**: MEDIUM  
**Files**: `apps/server/src/index.ts:39`  
**Issue**: Port 3000 hardcoded  
**Fix**: Use `env.PORT ?? 3000`
**Effort**: 5 minutes

---

## Low Priority Issues

### Docker Module

#### 38. Apply Changes Operation
**Severity**: LOW  
**Files**: `packages/api/src/lib/docker/stack.ts`  
**Issue**: After compose update, no trigger for stack reconfiguration  
**Fix**: Add equivalent of `docker-compose up -d`
**Effort**: 4-5 hours

#### 39. Dry-Run Mode
**Severity**: LOW  
**Files**: `packages/api/src/lib/docker/editor.ts`  
**Issue**: No way to validate compose without applying  
**Fix**: Add dry-run flag showing what would change
**Effort**: 3-4 hours

#### 40. Rollback API
**Severity**: LOW  
**Files**: `packages/api/src/lib/docker/editor.ts`  
**Issue**: Backups exist but no restore API  
**Fix**: Add restore from backup endpoint
**Effort**: 2-3 hours

#### 41. Event Stream Reconnection
**Severity**: LOW  
**Files**: `packages/api/src/lib/docker/stack.ts`  
**Issue**: If Docker daemon restarts, streams don't reconnect  
**Fix**: Auto-reconnect on connection loss
**Effort**: 4-6 hours

### Chat Module

#### 42. Dynamic System Prompt Loading
**Severity**: LOW  
**Files**: `apps/server/src/routes/chat.ts:99`  
**Issue**: Static system prompt, doesn't load AGENTS.md  
**Fix**: Implement file reading for agent context
**Effort**: 2-3 hours

#### 43. Real-time Session Updates
**Severity**: LOW  
**Files**: `packages/api/src/routers/chat.ts`  
**Issue**: No tRPC subscription for new messages  
**Fix**: Add subscription procedure
**Effort**: 2-3 hours

### Agent Files

#### 44. File Diff API
**Severity**: LOW  
**Files**: `packages/api/src/lib/agent/files.ts`  
**Issue**: No way to see what changed between versions  
**Fix**: Add `getFileDiff()` query
**Effort**: 1-2 hours

#### 45. Git Commit Author Config
**Severity**: LOW  
**Files**: `packages/api/src/lib/agent/files.ts`  
**Issue**: Commits use system git config  
**Fix**: Allow explicit git author configuration
**Effort**: 30 minutes

### UI Shell

#### 46. Markdown Rendering
**Severity**: LOW  
**Files**: `apps/web/src/routes/chat.tsx` (future)  
**Issue**: No markdown rendering for chat messages  
**Fix**: Use `react-markdown` with syntax highlighting
**Effort**: 2-3 hours

#### 47. Keyboard Shortcuts
**Severity**: LOW  
**Files**: `apps/web/src/components/layout/`  
**Issue**: No keyboard navigation shortcuts  
**Fix**: Add `Ctrl+K` for command palette, etc.
**Effort**: 2-3 hours

### Testing

#### 48. No Unit Tests
**Severity**: LOW  
**Impact**: All modules lack test coverage  
**Fix**: Add Vitest test suites
**Effort**: 16-20 hours (comprehensive)

#### 49. No E2E Tests
**Severity**: LOW  
**Impact**: Integration not verified  
**Fix**: Add Playwright/Cypress tests
**Effort**: 8-12 hours

---

## Consolidated Action Plan

### Phase 1: Unblock (Completed)

**Goal**: Fix critical blockers to get the application compiling and minimally functional.

| Task | File | Status |
|------|------|--------|
| Fix TypeScript compilation error | `packages/api/src/context.ts` | ✅ Done |
| Mount chat router in tRPC | `packages/api/src/routers/index.ts` | ✅ Done |
| Mount chat Hono route | `apps/server/src/index.ts` | ✅ Done |
| Fix tRPC route pattern | `apps/server/src/index.ts` | ✅ Done |
| Add `/health` endpoint | `apps/server/src/index.ts` | ✅ Done |
| Verify `pnpm check-types` passes | All | ✅ Done |
| Manual smoke test | All | ✅ Done |

**Deliverable**: Application compiles, health check works, tRPC accessible.

---

### Phase 2: Core Features (8-12 hours)

**Goal**: Implement missing UI and complete core functionality.

#### Backend (2-3 hours)

| Task | File | Time |
|------|------|------|
| Implement auto-session creation | `apps/server/src/routes/chat.ts` | 30 min |
| Add assistant message persistence | `apps/server/src/routes/chat.ts` | 1-2 hours |
| Add input validation (content limits) | `apps/server/src/routes/chat.ts` | 30 min |
| Fix N+1 query in listSessions | `packages/api/src/routers/chat.ts` | 30 min |
| Add protected container checks | `packages/api/src/lib/docker/stack.ts` | 2 hours |
| Add removeContainer procedure | `packages/api/src/routers/stack.ts` | 1 hour |
| Add path traversal protection | `packages/api/src/lib/docker/editor.ts` | 2 hours |

#### Frontend (6-9 hours)

| Task | File | Time |
|------|------|------|
| Create Chat Bay UI route | `apps/web/src/routes/chat.tsx` | 4-6 hours |
| Create Agent Files Editor route | `apps/web/src/routes/files.tsx` | 3-4 hours |
| Replace mock data with real API | `apps/web/src/routes/index.tsx` | 1 hour |
| Add container action buttons | `apps/web/src/routes/index.tsx` | 1-2 hours |
| Add navigation links | `apps/web/src/components/layout/Sidebar.tsx` | 30 min |

#### Infrastructure (1 hour)

| Task | File | Time |
|------|------|------|
| Create Dockerfile | `apps/server/Dockerfile` | 30 min |
| Add error handling middleware | `apps/server/src/index.ts` | 30 min |

**Deliverable**: Chat Bay and Agent Files functional, basic container management works.

---

### Phase 3: Polish & Security (4-6 hours)

**Goal**: Add real-time updates, improve UX, harden security.

| Task | File | Time |
|------|------|------|
| Add real-time container subscriptions | `apps/web/src/routes/index.tsx` | 2 hours |
| Add responsive sidebar | `apps/web/src/components/layout/Sidebar.tsx` | 2-3 hours |
| Add accessibility improvements | Multiple | 2 hours |
| Add compose file locking | `packages/api/src/lib/docker/editor.ts` | 4-6 hours |
| Add backup cleanup | `packages/api/src/lib/docker/editor.ts` | 2 hours |
| Add error boundaries | `apps/web/src/routes/` | 1-2 hours |
| Add graceful shutdown | `apps/server/src/index.ts` | 30 min |
| Add request logging | `apps/server/src/index.ts` | 30 min |

**Deliverable**: Production-ready application with good UX and security.

---

### Phase 4: Testing & Documentation (8-12 hours)

**Goal**: Ensure quality and maintainability.

| Task | File | Time |
|------|------|------|
| Write unit tests for Docker module | `packages/api/src/lib/docker/` | 4-6 hours |
| Write unit tests for Agent module | `packages/api/src/lib/agent/` | 2-3 hours |
| Write E2E tests | `e2e/` | 4-6 hours |
| Add API documentation | `docs/api/` | 2 hours |
| Deployment documentation | `docs/deployment.md` | 1 hour |

**Deliverable**: Comprehensive test coverage, documented API.

---

## Cross-Cutting Concerns

### 1. Type Safety Consistency
All modules show excellent type safety practices except for the one blocking error in `context.ts`. Once fixed, maintain this standard:
- Continue using `readonly` modifiers
- Keep explicit return types
- Use discriminated unions for status types
- No `any` types allowed

### 2. Router Mounting Pattern
A recurring issue across reviews: routers are created but not mounted. Establish a checklist:
- [ ] Create router in `packages/api/src/routers/{name}.ts`
- [ ] Export router from `packages/api/src/routers/index.ts`
- [ ] Mount in Hono app in `apps/server/src/index.ts` (if REST endpoints needed)

### 3. Frontend-Backend Wiring
Another recurring gap: backend exists but frontend doesn't use it. Establish pattern:
- tRPC queries for data fetching
- tRPC mutations for actions
- tRPC subscriptions for real-time updates
- AI SDK `useChat` for streaming

### 4. Security Defense in Depth
Multiple security gaps identified:
- Path validation for all file operations
- Input sanitization for user content
- Protected container labels
- Rate limiting (future)

### 5. Error Handling Strategy
Inconsistent error handling across modules. Standardize:
- Use custom error classes (e.g., `AgentFileError`)
- Map to appropriate HTTP status codes
- Log full errors server-side
- Return user-friendly messages client-side

---

## Files Requiring Changes

### Critical Priority

| File | Issue | Phase |
|------|-------|-------|
| `packages/api/src/context.ts` | Unused parameter | 1 |
| `packages/api/src/routers/index.ts` | Missing chat router | 1 |
| `apps/server/src/index.ts` | Missing chat routes, wrong pattern, no health | 1 |
| `apps/web/src/routes/chat.tsx` | Does not exist | 2 |
| `apps/web/src/routes/files.tsx` | Does not exist | 2 |
| `apps/server/src/routes/chat.ts` | No assistant persistence, no auto-session | 2 |
| `apps/server/Dockerfile` | Does not exist | 2 |

### High Priority

| File | Issue | Phase |
|------|-------|-------|
| `packages/api/src/lib/docker/stack.ts` | No protected checks, no remove | 2 |
| `packages/api/src/lib/docker/editor.ts` | Path traversal, no locking | 2-3 |
| `packages/api/src/routers/stack.ts` | Missing removeContainer | 2 |
| `packages/api/src/routers/chat.ts` | N+1 query, ordering | 2 |
| `apps/web/src/routes/index.tsx` | Mock data, no actions, no subscriptions | 2 |

### Medium Priority

| File | Issue | Phase |
|------|-------|-------|
| `packages/api/src/lib/docker/stack.ts` | Event stream cleanup | 3 |
| `packages/api/src/lib/docker/editor.ts` | Backup cleanup | 3 |
| `packages/api/src/lib/agent/files.ts` | No git check, hardcoded path | 3 |
| `apps/web/src/components/layout/Sidebar.tsx` | Not responsive | 3 |
| `apps/server/src/index.ts` | No graceful shutdown | 3 |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Critical Issues** | 11 |
| **High Priority** | 12 |
| **Medium Priority** | 16 |
| **Low Priority** | 12 |
| **Total Issues** | 51 |

### Effort Summary

| Phase | Time | Focus |
|-------|------|-------|
| Phase 1: Unblock | 2-4 hours | Compilation, routing |
| Phase 2: Core Features | 8-12 hours | UI, persistence, security |
| Phase 3: Polish | 4-6 hours | UX, real-time, hardening |
| Phase 4: Testing | 8-12 hours | Tests, docs |
| **Total** | **22-34 hours** | **Production Ready** |

---

*Generated from 11 review files across Gateway and Gemini review streams*  
*Date: 2026-02-03*  
*Reviewers: Clawthis, Gemini*
