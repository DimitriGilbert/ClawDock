# Gateway Reactivity Research for ClawDock

*Research Date: 2026-02-03*

---

## 1. Problem Statement

ClawDock's Gateway needs real-time reactivity for multiple use cases:

- **Dashboard**: Live Docker stack state (container health, status changes, resource usage)
- **Chat Bay**: Streaming AI responses (LLM token-by-token output)
- **Agent Status**: Real-time updates when agent activity changes
- **Log Streaming**: Live container logs from dockerode

The current stack (TanStack Router + Hono + tRPC + Postgres) needs a reactivity layer. The question: **which approach provides the best balance of simplicity, self-hostability, and capability?**

---

## 2. Existing Solutions

### 2.1 tRPC Subscriptions

tRPC offers two subscription transports:

#### WebSocket Subscriptions (`wsLink`)

```typescript
// Server - using async generator (recommended)
const chatRouter = router({
  onMessage: publicProcedure
    .input(z.object({ roomId: z.string() }))
    .subscription(async function* ({ input, signal }) {
      const messages = getMessageStream(input.roomId, signal);
      for await (const message of messages) {
        yield message;
      }
    }),
});

// Client
const wsClient = createWSClient({ url: 'ws://localhost:3000' });

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({ url: 'http://localhost:3000/trpc' })
    })
  ]
});
```

#### SSE Subscriptions (`httpSubscriptionLink`) - New in v11

```typescript
// Client setup - no WebSocket server needed
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: '/api/trpc' }),
      false: httpBatchLink({ url: '/api/trpc' }),
    }),
  ],
});
```

**Pros**:
- End-to-end type safety (the biggest win)
- Shared middleware, context, and procedures with queries/mutations
- SSE option simplifies deployment (no WebSocket server)
- Native reconnection with SSE
- Already in our stack (no new dependencies)

**Cons**:
- WebSocket mode: Requires sticky sessions for horizontal scaling
- WebSocket mode: Stateful connections complicate serverless (not our concern - we're containerized)
- SSE mode: Unidirectional (server → client only) - client must POST separately
- Slight abstraction overhead vs raw WebSocket/SSE

**Critical Limitation**: tRPC subscriptions work at the procedure level. They don't provide Convex-style "automatic reactivity" where database changes automatically push to clients. You must manually emit events when data changes.

### 2.2 Convex

Convex is a reactive database with built-in real-time subscriptions.

#### Self-Hosting Status (Critical Finding)

**Convex open-sourced their backend in April 2024** under Apache 2.0 license.

```bash
# Official Docker deployment
docker run -p 3210:3210 -p 3211:3211 \
  ghcr.io/get-convex/convex-backend:latest

# Or via docker-compose
curl -O https://raw.githubusercontent.com/get-convex/convex-backend/main/self-hosted/docker/docker-compose.yml
docker compose up
```

**Self-hosted with Postgres backend**:
```bash
psql postgres -c "CREATE DATABASE convex_self_hosted"
export POSTGRES_URL='postgresql://<username>@host.docker.internal:5432'
export DO_NOT_REQUIRE_SSL=1
docker compose up
```

**What's included in self-hosted**:
- Core reactive database engine
- TypeScript queries/mutations/actions
- Real-time subscriptions
- File storage support

**What's NOT included (Cloud-only)**:
- Web Dashboard (must use CLI)
- One-click auth integrations (manual setup required)
- Automatic horizontal scaling
- Git-push deployment workflow
- Automated backups/alerting

**Pros**:
- Automatic reactivity (queries re-run when data changes)
- No manual event emission needed
- Excellent TypeScript DX
- Self-hostable via Docker (confirmed)
- Replaces need for separate database + reactivity layer

**Cons**:
- **Adds significant complexity**: Would need to replace Postgres + Drizzle + tRPC with Convex
- Dashboard requires Cloud or running separate dashboard container
- Overkill if we just need event streaming (we already have Postgres)
- Learning curve for the team
- Less mature self-hosting story than managed cloud

**Verdict**: Convex is viable for self-hosting but represents an architectural pivot. Not recommended when we already have Postgres + Drizzle working.

### 2.3 Socket.io

The mature bidirectional WebSocket library with fallbacks.

```typescript
// Server (Hono integration)
import { Server } from 'socket.io';
import { createServer } from 'http';

const io = new Server(httpServer, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  socket.on('subscribe:logs', (containerId) => {
    // Stream logs to this client
    docker.streamLogs(containerId, (line) => {
      socket.emit('log', { containerId, line });
    });
  });
  
  socket.on('subscribe:stack', () => {
    // Add to room for stack updates
    socket.join('stack-updates');
  });
});

// Broadcast stack changes
function notifyStackChange(event) {
  io.to('stack-updates').emit('stack:change', event);
}
```

**Pros**:
- Full bidirectional communication
- Built-in Rooms and Namespaces (great for container-specific streams)
- Excellent fallbacks (long-polling if WebSocket fails)
- Binary data support
- Mature ecosystem

**Cons**:
- **No type safety** - Must manually define types on both ends
- Heavier client bundle (~40KB)
- Requires sticky sessions for horizontal scaling
- Non-standard protocol (custom client required)
- Adds dependency outside tRPC ecosystem

### 2.4 Server-Sent Events (SSE) - Raw

Pure HTTP streaming without abstraction.

```typescript
// Server (Hono)
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

const app = new Hono();

app.get('/events/stack', (c) => {
  return streamSSE(c, async (stream) => {
    // Subscribe to Docker events
    docker.subscribeToEvents(async (event) => {
      await stream.writeSSE({
        event: 'stack-change',
        data: JSON.stringify(event)
      });
    });
    
    // Keep alive
    while (true) {
      await stream.writeSSE({ event: 'ping', data: '' });
      await stream.sleep(30000);
    }
  });
});

// Client (native API)
const eventSource = new EventSource('/events/stack');
eventSource.addEventListener('stack-change', (e) => {
  const event = JSON.parse(e.data);
  updateDashboard(event);
});
```

**Pros**:
- **Simplest option** - Native browser API, no client library
- Scales easily (just HTTP, no sticky sessions)
- HTTP/2 multiplexing (hundreds of streams over one connection)
- Automatic browser reconnection
- Firewall/proxy friendly
- Minimal server overhead

**Cons**:
- **Unidirectional only** (server → client)
- Text-only (binary requires Base64)
- No built-in type safety (unless we wrap it)
- Manual protocol design

---

## 3. Comparison Matrix

| Feature | tRPC Subscriptions | Convex | Socket.io | Raw SSE |
|---------|-------------------|--------|-----------|---------|
| **Type Safety** | Native | Native | Manual | Manual |
| **Direction** | Both (WS) / Server→Client (SSE) | Bidirectional | Bidirectional | Server→Client |
| **Self-Hosted** | Yes | Yes (limited) | Yes | Yes |
| **Scaling** | Sticky (WS) / Easy (SSE) | Complex | Sticky + Redis | Easy |
| **Stack Integration** | Already using tRPC | Replace Postgres | New dependency | Hono native |
| **Docker Friendly** | Yes | Yes | Yes (needs Redis for scale) | Yes |
| **Complexity** | Low | High (full pivot) | Medium | Lowest |
| **Automatic Reactivity** | No (manual events) | Yes | No | No |
| **Client Bundle** | Small | Medium | ~40KB | 0KB (native) |

---

## 4. Recommendation

### Primary: tRPC Subscriptions with SSE (`httpSubscriptionLink`)

**Rationale**:

1. **Already in stack**: We're using tRPC. Subscriptions are a natural extension.
2. **Type safety**: End-to-end types without extra work.
3. **SSE simplifies deployment**: No WebSocket server, no sticky sessions.
4. **Hono compatible**: Works with our backend.
5. **Sufficient for our needs**: Dashboard, logs, and agent status are all server→client streams.

For the Chat Bay (AI streaming), SSE is the industry standard (this is what ChatGPT uses).

### When to Use WebSocket Mode

Upgrade to `wsLink` only if we need **true bidirectional streaming** (e.g., collaborative editing). For ClawDock's current needs, SSE is sufficient.

### Why NOT Convex

While Convex's automatic reactivity is elegant, adopting it would mean:
- Replacing Postgres + Drizzle (working, familiar stack)
- Learning new patterns
- More complex self-hosted setup
- Dashboard requires separate container or Cloud

This is architectural churn for marginal benefit. We can get 90% of the value with tRPC subscriptions.

### Why NOT Socket.io

- No type safety (big regression from tRPC)
- Adds complexity (Redis for scaling)
- Non-standard protocol

### When Raw SSE Makes Sense

For **log streaming specifically**, raw SSE via Hono might be simpler than tRPC subscriptions because:
- Logs are pure text streams
- No need for complex request/response patterns
- Hono's `streamSSE` is trivial to implement

Consider a hybrid: tRPC subscriptions for typed events (stack changes, agent status) + raw SSE for raw log streams.

---

## 5. Implementation Notes

### 5.1 tRPC SSE Setup with Hono

```typescript
// server/trpc/router.ts
import { router, publicProcedure } from './trpc';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { EventEmitter } from 'events';

// Event bus for stack changes
export const stackEvents = new EventEmitter();

export const stackRouter = router({
  // Regular query
  getContainers: publicProcedure.query(async () => {
    return await docker.listContainers();
  }),
  
  // SSE subscription for real-time updates
  onStackChange: publicProcedure
    .subscription(() => {
      return observable<StackEvent>((emit) => {
        const handler = (event: StackEvent) => {
          emit.next(event);
        };
        
        stackEvents.on('change', handler);
        
        return () => {
          stackEvents.off('change', handler);
        };
      });
    }),
});

// Emit events when Docker state changes
docker.subscribeToEvents((event) => {
  stackEvents.emit('change', {
    type: event.action,
    container: event.container,
    timestamp: Date.now()
  });
});
```

### 5.2 Client Integration

```typescript
// client/hooks/useStackUpdates.ts
import { trpc } from '../utils/trpc';

export function useStackUpdates() {
  const [containers, setContainers] = useState<Container[]>([]);
  
  // Initial load
  const { data } = trpc.stack.getContainers.useQuery();
  
  // Subscribe to real-time updates
  trpc.stack.onStackChange.useSubscription(undefined, {
    onData: (event) => {
      // Update local state based on event
      setContainers((prev) => updateContainers(prev, event));
    },
  });
  
  return containers;
}
```

### 5.3 Raw SSE for Log Streaming (Hybrid Approach)

```typescript
// server/routes/logs.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

export const logsRouter = new Hono();

logsRouter.get('/logs/:containerId', (c) => {
  const containerId = c.req.param('containerId');
  
  return streamSSE(c, async (stream) => {
    const cleanup = await docker.streamLogs(containerId, async (line) => {
      await stream.writeSSE({
        event: 'log',
        data: line
      });
    });
    
    // Handle client disconnect
    stream.onAbort(() => {
      cleanup();
    });
  });
});
```

```typescript
// client/hooks/useContainerLogs.ts
export function useContainerLogs(containerId: string) {
  const [logs, setLogs] = useState<string[]>([]);
  
  useEffect(() => {
    const eventSource = new EventSource(`/api/logs/${containerId}`);
    
    eventSource.addEventListener('log', (e) => {
      setLogs((prev) => [...prev.slice(-1000), e.data]); // Keep last 1000 lines
    });
    
    return () => eventSource.close();
  }, [containerId]);
  
  return logs;
}
```

### 5.4 AI Streaming in Chat Bay

For LLM responses, use the AI SDK's built-in streaming which uses SSE under the hood:

```typescript
// Already handled by AI SDK
import { streamText } from 'ai';

// The AI SDK handles SSE streaming automatically
const result = streamText({
  model: openai('gpt-4'),
  prompt: userMessage,
});

return result.toTextStreamResponse();
```

---

## 6. Open Questions

### 6.1 Resolved

- **Can tRPC handle our reactivity needs?** → Yes, with SSE subscriptions
- **Is Convex self-hostable?** → Yes, but adds complexity we don't need
- **WebSocket vs SSE?** → SSE for simplicity; WS only if bidirectional needed

### 6.2 Still Open

1. **Event bus architecture**: Should we use a single EventEmitter or multiple per domain (stack, agent, logs)? Multiple is cleaner for large-scale, but single is simpler.

2. **Reconnection strategy**: tRPC's SSE link handles reconnection, but should we add explicit "catch up" logic to replay missed events?

3. **Event persistence**: Should stack events be persisted (for replay) or ephemeral? Currently leaning ephemeral - the source of truth is Docker itself.

4. **Rate limiting subscriptions**: Should we throttle high-frequency events (like container stats)? Yes - probably batch stats updates to 1/second.

5. **Authentication for subscriptions**: How do we authenticate SSE connections? The link supports custom headers - need to integrate with our auth system.

---

## 7. Decision Summary

| Need | Solution |
|------|----------|
| Dashboard stack updates | tRPC subscription (SSE) |
| Agent status changes | tRPC subscription (SSE) |
| AI chat streaming | AI SDK (SSE built-in) |
| Container log streaming | Raw SSE via Hono (or tRPC) |
| Full database reactivity | Not needed (use subscriptions + queries) |

**Final verdict**: tRPC subscriptions with `httpSubscriptionLink` (SSE mode) provide sufficient reactivity for ClawDock without adding architectural complexity. Convex is viable but unnecessary given our existing Postgres + Drizzle stack.

---

## References

- [tRPC Subscriptions Documentation](https://trpc.io/docs/subscriptions)
- [tRPC httpSubscriptionLink](https://trpc.io/docs/client/links/httpSubscriptionLink)
- [Convex Self-Hosting Guide](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/hosting_on_own_infra.md)
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming)
- [Socket.io vs SSE Comparison](https://socket.io/docs/v4/)
- [AI SDK Streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming)
