# Todos
[✓] 
[VERIFY] Dockerfile is complete (multi-stage, Node 20 Alpine, healthcheck)
[ ] 
[WAVE 1] Agent A: Chat Backend Fixes (#6, #7, #18, #19)
[ ] 
[WAVE 1] Agent B: Security Hardening (#12, #13, #14)
[ ] 
[WAVE 1] Agent C: Snapshot Router + Error Middleware (#11, #23)
[ ] 
[CHECKPOINT] Wave 1 Integration Verification
[ ] 
[WAVE 2] Agent E: Chat Bay UI (#4)
[ ] 
[WAVE 2] Agent F: Agent Files Editor (#5)
[ ] 
[WAVE 2] Agent G: Dashboard Wiring (#20, #21, #22)
[ ] 
[CHECKPOINT] Wave 2 Integration Verification
[ ] 
[WAVE 3] Agent H: Compose File Locking (#15)
[ ] 
[WAVE 3] Agent I: Stream Cleanup + Backup Cleanup (#24, #25)
[ ] 
[WAVE 3] Agent J: UI Polish - Responsive Sidebar (#33, #34, #35)
[ ] 
[WAVE 3] Agent K: Server Hardening (#36, #37)
[ ] 
[WAVE 3] Agent D: Log Streaming & Stats (#16, #17) - DEFERRED
[ ] 
[FINAL] Full Integration & Build Verification
---
## FINAL ORCHESTRATION PLAN
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ✅ DOCKERFILE VERIFIED: Multi-stage, Node 20 Alpine, Health Check          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 1: BACKEND CORE (3 Parallel Agents)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐         │
│  │    AGENT A        │ │    AGENT B        │ │    AGENT C        │         │
│  │   Chat Backend    │ │ Security Hardening│ │ Router+Middleware │         │
│  │                   │ │                   │ │                   │         │
│  │ #6:  Auto-session │ │ #12: removeContr. │ │ #11: snapshotRtr  │         │
│  │ #7:  AI persist   │ │ #13: Protected    │ │ #23: Error MW     │         │
│  │ #18: N+1 fix      │ │ #14: Path traversal│                   │         │
│  │ #19: Validation   │ │                   │ │                   │         │
│  │                   │ │ Files:            │ │ Files:            │         │
│  │ Files:            │ │ - stack.ts        │ │ - routers/index.ts│         │
│  │ - routes/chat.ts  │ │ - stack router    │ │ - server/index.ts │         │
│  │ - routers/chat.ts │ │ - editor.ts       │ │                   │         │
│  │                   │ │                   │ │                   │         │
│  │ Time: 2-3 hours   │ │ Time: 4-5 hours   │ │ Time: 1-2 hours   │         │
│  └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘         │
│            │                     │                     │                    │
│            └─────────────────────┼─────────────────────┘                    │
│                                  ▼                                          │
│              ┌─────────────────────────────────────────┐                    │
│              │       CHECKPOINT: Wave 1 Verify         │                    │
│              │  • pnpm check-types                     │                    │
│              │  • Routers mounted in appRouter         │                    │
│              │  • Hono routes mounted in server        │                    │
│              │  • API endpoints respond                │                    │
│              └─────────────────────┬───────────────────┘                    │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 2: FRONTEND UI (3 Parallel Agents)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐         │
│  │    AGENT E        │ │    AGENT F        │ │    AGENT G        │         │
│  │   Chat Bay UI     │ │ Agent Files Editor│ │ Dashboard Wiring  │         │
│  │                   │ │                   │ │                   │         │
│  │ #4: Create        │ │ #5: Create        │ │ #20: Real data    │         │
│  │     chat.tsx      │ │     files.tsx     │ │ #21: Actions      │         │
│  │                   │ │                   │ │ #22: Real-time    │         │
│  │ Features:         │ │ Features:         │ │                   │         │
│  │ - useChat hook    │ │ - File list       │ │ Features:         │         │
│  │ - Message list    │ │ - MD editor       │ │ - listContainers  │         │
│  │ - Input area      │ │ - Preview pane    │ │ - Start/Stop btns │         │
│  │ - Session sidebar │ │ - Version history │ │ - Subscriptions   │         │
│  │                   │ │                   │ │                   │         │
│  │ Time: 4-6 hours   │ │ Time: 3-4 hours   │ │ Time: 3-4 hours   │         │
│  └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘         │
│            │                     │                     │                    │
│            └─────────────────────┼─────────────────────┘                    │
│                                  ▼                                          │
│              ┌─────────────────────────────────────────┐                    │
│              │       CHECKPOINT: Wave 2 Verify         │                    │
│              │  • pnpm check-types                     │                    │
│              │  • pnpm -F web build                    │                    │
│              │  • /chat route loads                    │                    │
│              │  • /files route loads                   │                    │
│              │  • Dashboard shows real containers      │                    │
│              └─────────────────────┬───────────────────┘                    │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 3: POLISH & STABILITY (5 Parallel Agents)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐     │
│  │  AGENT H  │ │  AGENT I  │ │  AGENT J  │ │  AGENT K  │ │  AGENT D  │     │
│  │ Locking   │ │ Cleanup   │ │ UI Polish │ │  Server   │ │ Logs/Stats│     │
│  │           │ │           │ │           │ │           │ │ (DEFERRED)│     │
│  │ #15       │ │ #24, #25  │ │ #33-35    │ │ #36, #37  │ │ #16, #17  │     │
│  │           │ │           │ │           │ │           │ │           │     │
│  │ File lock │ │ Stream    │ │ Responsive│ │ Graceful  │ │ SSE logs  │     │
│  │ for edits │ │ cleanup   │ │ sidebar   │ │ shutdown  │ │ CPU/mem   │     │
│  │           │ │ Backup    │ │ A11y      │ │ Env port  │ │ stats     │     │
│  │           │ │ limit     │ │ Err bound │ │           │ │           │     │
│  │           │ │           │ │           │ │           │ │           │     │
│  │ 4-6h      │ │ 4-5h      │ │ 4-6h      │ │ 1h        │ │ 6-8h      │     │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘     │
│        │             │             │             │             │           │
│        └─────────────┴──────┬──────┴─────────────┴─────────────┘           │
│                             ▼                                               │
│              ┌─────────────────────────────────────────┐                    │
│              │       FINAL: Full Verification          │                    │
│              │  • pnpm check-types                     │                    │
│              │  • pnpm build                           │                    │
│              │  • Mark items in fix plan               │                    │
│              └─────────────────────────────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
---
Agent Task Specifications
WAVE 1 - Parallel Backend Agents
Agent A Prompt (Chat Backend):
Fix chat backend issues in ClawDock:
1. #6: Auto-session creation - In apps/server/src/routes/chat.ts, create session if sessionId not provided
2. #7: Assistant message persistence - Use onFinish callback in streamText to save AI response to DB  
3. #18: N+1 query fix - In packages/api/src/routers/chat.ts:46-64, use SQL aggregation instead of Promise.all
4. #19: Input validation - Add z.string().max(100_000) for content field
Files to modify:
- apps/server/src/routes/chat.ts
- packages/api/src/routers/chat.ts
Run pnpm check-types before completing.
Agent B Prompt (Security Hardening):
Implement Docker security in ClawDock:
1. #12: Protected container checks - Add check for com.clawdock.protected label in stack.ts
2. #13: removeContainer procedure - Add tRPC mutation to stackRouter with protection
3. #14: Path traversal protection - Add path validation in editor.ts:readComposeFile
Protected containers: gateway, traefik, postgres
Files to modify:
- packages/api/src/lib/docker/stack.ts (add removeContainer function with protection)
- packages/api/src/routers/stack.ts (add removeContainer mutation)
- packages/api/src/lib/docker/editor.ts (add path validation)
Run pnpm check-types before completing.
Agent C Prompt (Router + Middleware):
Add missing router and middleware in ClawDock:
1. #11: Create snapshotRouter - Create packages/api/src/routers/snapshot.ts and mount in appRouter
2. #23: Hono error middleware - Add global error handler in apps/server/src/index.ts
Files to modify:
- packages/api/src/routers/snapshot.ts (create)
- packages/api/src/routers/index.ts (mount snapshotRouter)
- apps/server/src/index.ts (add error middleware)
Run pnpm check-types before completing.
---
WAVE 2 - Parallel Frontend Agents
Agent E Prompt (Chat Bay UI):
Build Chat Bay UI for ClawDock:
File: apps/web/src/routes/chat.tsx
Requirements:
- Use @ai-sdk/react useChat hook
- Connect to /api/chat endpoint  
- Message list with user/assistant bubbles
- Input area with submit button
- Session sidebar with session list from trpc.chat.listSessions
- Session creation and deletion
Use existing UI components from apps/web/src/components/ui/
Follow TanStack Router pattern from existing routes.
Run pnpm check-types before completing.
Agent F Prompt (Agent Files Editor):
Build Agent Files Editor for ClawDock:
File: apps/web/src/routes/files.tsx
Requirements:
- File list: AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md
- Use trpc.agent.getFile and trpc.agent.updateFile  
- Markdown editor (textarea with monospace font)
- Side-by-side preview (use react-markdown or simple)
- Version history from trpc.agent.getFileHistory
- Revert button using trpc.agent.revertFile
Use existing UI components from apps/web/src/components/ui/
Run pnpm check-types before completing.
Agent G Prompt (Dashboard Wiring):
Wire Dashboard to real API in ClawDock:
File: apps/web/src/routes/index.tsx
Requirements:
- Replace MOCK_CONTAINERS with trpc.stack.listContainers.useQuery()
- Add Start/Stop/Restart buttons using trpc mutations
- Add real-time updates via trpc.stack.onContainerChange.useSubscription()
Keep existing UI structure but connect to real data.
Run pnpm check-types before completing.
---
WAVE 3 - Parallel Polish Agents
Agent H Prompt (Compose Locking):
Implement compose file locking in ClawDock:
File: packages/api/src/lib/docker/editor.ts
Add file-based locking to prevent concurrent edits:
- Lock acquisition before write
- Timeout with error message
- Lock release in finally block
Agent I Prompt (Cleanup):
Implement cleanup in ClawDock:
1. #24: Event stream cleanup - Track multiple subscriptions, add shutdown handlers in stack.ts
2. #25: Backup cleanup - Limit to 10 backups, add cleanup in editor.ts
Agent J Prompt (UI Polish):
Polish UI in ClawDock:
1. #33: Responsive sidebar - Add hamburger menu, mobile collapse
2. #34: Accessibility - Add ARIA labels, aria-current to nav
3. #35: Error boundaries - Add React error boundaries to routes
Agent K Prompt (Server):
Server hardening in ClawDock:
1. #36: Graceful shutdown - Add SIGTERM/SIGINT handlers
2. #37: Environment port - Use env.PORT ?? 3000
Agent D Prompt (Logs & Stats - DEFERRED):
Implement observability in ClawDock:
1. #16: Log streaming SSE endpoint at /api/logs/:containerId
2. #17: Resource stats (CPU/Memory) at /api/stats/:containerId
---
Summary
| Wave | Agents | Issues | Parallelism | Estimated Time |
|------|--------|--------|-------------|----------------|
| 1 | A, B, C | 8 | Full parallel | ~5h (longest: B) |
| 2 | E, F, G | 4 | Full parallel | ~6h (longest: E) |
| 3 | H, I, J, K, D | 11 | Full parallel | ~8h (longest: D) |
Total wall-clock estimate: ~19 hours (with full parallelization)
Risk mitigation:
- I (Clawthis) verify integration after each wave
- Each agent must run pnpm check-types
- Router/route mounting is part of each agent's scope
---