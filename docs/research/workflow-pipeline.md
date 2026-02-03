# Workflow Pipeline Research: Durable Execution for ClawDock

*Research Date: 2026-02-03*

---

## 1. Problem Statement

ClawDock needs durable, observable execution for long-running agent workflows:

| Requirement | Why It Matters |
|-------------|----------------|
| **Durable Execution** | Build pipeline (PRD -> tasks -> execute -> verify) must survive restarts |
| **Multi-Step Orchestration** | Agent workflows have many sequential/parallel steps |
| **Human-in-the-Loop** | Approval flows for security decisions, PRD review |
| **Retry & Recovery** | Handle transient failures gracefully |
| **Observable State** | Debug workflows, inspect progress, replay failed runs |
| **Self-Hostable** | Must run in Docker containers (local-first philosophy) |
| **TypeScript Native** | Compatible with Hono backend, type-safe |

### Key Use Cases

1. **Build Pipeline**: PRD creation -> Task breakdown -> Code generation -> Test -> Deploy
2. **Bay Processing**: Email arrives -> Threat analysis -> AI processing -> Response
3. **Scheduled Workflows**: Daily digest, weekly reflection audits
4. **Long-Running Tasks**: Large file processing, multi-step API integrations

---

## 2. Existing Solutions

### 2.1 Workflow DevKit (useworkflow.dev)

**What it is**: Vercel's new TypeScript-native durable execution framework. Uses a `"use workflow"` directive to mark functions as durable.

```typescript
import { sleep } from "workflow";

export async function buildPipeline(prdId: string) {
  "use workflow";
  
  const tasks = await breakdownPRD(prdId);
  
  for (const task of tasks) {
    await executeTask(task);
    // Survives restarts between steps
  }
  
  await sleep("1 hour");  // Suspends without consuming resources
  await verifyDeployment(prdId);
}
```

**Key Features:**
- `"use workflow"` / `"use step"` directives for durability
- Built-in observability (traces, logs, metrics, time-travel debugging)
- Human-in-the-loop support via `/docs/ai/human-in-the-loop`
- Native Hono adapter (perfect for ClawDock)
- Sleep/suspend without resource consumption
- Streaming support for AI agents
- Open source, runs anywhere (Docker, local, cloud)

**Pros:**
- TypeScript-native with full type safety
- Excellent DX - minimal boilerplate
- **Has official Hono integration**
- Self-hostable (runs on any Node.js environment)
- Built-in observability dashboard
- Human-in-the-loop is a first-class feature
- From Vercel - well-funded, active development
- Lightweight compared to Temporal

**Cons:**
- Currently in beta
- Newer project, less battle-tested than Temporal
- Documentation still maturing
- Requires understanding of determinism constraints

**Self-Hosting:**
- Runs on Node.js, can be containerized
- No external dependencies for basic setup
- State persistence options configurable

**Verdict: STRONG FIT** - Designed for exactly our use case

---

### 2.2 Temporal.io

**What it is**: The industry-standard durable execution platform. Used by Stripe, Uber, Netflix for mission-critical workflows.

```typescript
import { defineSignal, condition } from '@temporalio/workflow';

const approvalSignal = defineSignal<[boolean]>('approvalSignal');

export async function buildPipeline(prdId: string) {
  let approved = false;
  
  setHandler(approvalSignal, (decision) => { approved = decision; });
  
  await condition(() => approved);  // Wait for human approval
  
  // Continue with build...
}
```

**Minimal Docker Compose:**
```yaml
services:
  postgresql:
    image: postgres:13
    environment:
      - POSTGRES_USER=temporal
      - POSTGRES_PASSWORD=temporal
      - POSTGRES_DB=temporal

  temporal:
    image: temporalio/auto-setup:1.24
    ports:
      - "7233:7233"
    environment:
      - DB=postgresql
      - POSTGRES_SEEDS=postgresql
    depends_on:
      - postgresql

  temporal-ui:
    image: temporalio/ui:latest
    ports:
      - "8080:8080"
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
```

**Pros:**
- Most mature and battle-tested
- Extremely powerful (signals, queries, child workflows)
- TypeScript SDK available
- Self-hostable with docker-compose
- Infinite scalability
- Strong community

**Cons:**
- **High operational overhead** (3+ containers minimum)
- Steep learning curve
- Memory hungry (~1-1.5GB minimum)
- Overkill for simple workflows
- Worker-based architecture (requires long-running processes)
- Determinism constraints can be confusing

**Verdict: OVERKILL** - Too complex for our needs. Reserve for enterprise-scale.

---

### 2.3 Inngest

**What it is**: Event-driven orchestration platform with excellent serverless support. Push-based architecture.

```typescript
import { Inngest } from "inngest";

const inngest = new Inngest({ id: "clawdock" });

export const buildPipeline = inngest.createFunction(
  { id: "build-pipeline" },
  { event: "app/prd.created" },
  async ({ event, step }) => {
    const tasks = await step.run("breakdown", () => breakdownPRD(event.data.prdId));
    
    // Wait for human approval (up to 3 days)
    const approval = await step.waitForEvent("wait-approval", {
      event: "app/build.approved",
      timeout: "3d",
      match: "data.prdId",
    });
    
    if (!approval) return { status: "timeout" };
    
    await step.run("execute", () => executeBuild(tasks));
  }
);
```

**Pros:**
- Excellent TypeScript DX
- `step.waitForEvent` for human-in-the-loop
- Event-driven (fits async workflows)
- Works well with serverless
- Local dev server available
- Zod integration for type safety

**Cons:**
- **Self-hosting is limited** - open-source dev server only
- Production self-hosting requires Redis + proprietary bits
- Webhook/push-based (requires public URL)
- Less suitable for truly long-running processes
- Cloud-centric business model

**Self-Hosting Status:**
```yaml
# Dev server only - not production-grade self-hosting
services:
  inngest:
    image: inngest/inngest:latest
    ports:
      - "8288:8288"
    environment:
      - DEV=true
```

**Verdict: PARTIAL FIT** - Great DX but self-hosting story is weak

---

### 2.4 Trigger.dev

**What it is**: Background task platform focused on long-running jobs. V3 ("Onyx") is the current version.

```typescript
import { task } from "@trigger.dev/sdk/v3";

export const buildPipeline = task({
  id: "build-pipeline",
  run: async (payload: { prdId: string }) => {
    // Just write TypeScript - retries handled automatically
    const tasks = await breakdownPRD(payload.prdId);
    
    for (const task of tasks) {
      await executeTask(task);
    }
  },
});
```

**Pros:**
- Best-in-class TypeScript DX
- No timeout limits (can run for hours/days)
- Real-time observability dashboard
- Excellent local development CLI
- Open source (Apache 2.0)

**Cons:**
- **V3 self-hosting is "Early Access"** - not production ready
- Requires "Provider" infrastructure (Docker or K8s orchestrator)
- More complex than it appears
- Better suited for background jobs than orchestration
- Less mature human-in-the-loop story

**Self-Hosting Status (V3):**
- Code is open source
- Self-hosting requires: PostgreSQL, Redis, Platform, Provider
- No simple docker-compose yet for V3
- V2 was easier to self-host but is deprecated

**Verdict: NOT READY** - Wait for V3 self-hosting to mature

---

### 2.5 BullMQ / Job Queues

**What it is**: Redis-based job queue with DAG/Flow support for workflow orchestration.

```typescript
import { FlowProducer, Worker } from 'bullmq';

const flowProducer = new FlowProducer({ connection });

// Define workflow as DAG
const flow = {
  name: 'deploy',
  queueName: 'deploy-queue',
  children: [
    {
      name: 'test',
      queueName: 'test-queue',
      children: [
        { name: 'build', queueName: 'build-queue' },
        { name: 'lint', queueName: 'lint-queue' },
      ]
    }
  ]
};

await flowProducer.add(flow);
```

**Pros:**
- Battle-tested, widely used
- Simple mental model
- Redis-only dependency
- Typed with TypeScript
- Fan-out/fan-in patterns
- Configurable retries with backoff
- Low resource overhead

**Cons:**
- **No native human-in-the-loop** - must implement manually
- DAG-based, not code-based (less intuitive)
- No built-in observability (need additional tools)
- State management is more manual
- No "sleep for 7 days" without workarounds

**Human-in-the-Loop Pattern (Manual):**
```typescript
// Step 1: Pause and mark as "waiting approval"
await db.update(workflowId, { status: 'PENDING_APPROVAL' });

// Step 2: API endpoint for approval
app.post('/approve/:id', async (c) => {
  await approvalQueue.add('continue-build', { workflowId: c.req.param('id') });
  return c.json({ status: 'resumed' });
});
```

**Verdict: FALLBACK OPTION** - Simpler but requires more custom code

---

### 2.6 Upstash Workflow

**What it is**: Managed durable execution designed for serverless. Has native Hono integration.

```typescript
import { Hono } from 'hono';
import { serve } from '@upstash/workflow/hono';

const app = new Hono();

app.post('/build', serve(async (context) => {
  const { prdId } = context.requestPayload;
  
  const tasks = await context.run('breakdown', () => breakdownPRD(prdId));
  
  await context.sleep('wait-review', 60 * 60 * 24);  // 24 hours
  
  await context.run('execute', () => executeBuild(tasks));
}));
```

**Pros:**
- Excellent Hono integration
- Similar API to Workflow DevKit
- Serverless-native
- Type-safe TypeScript

**Cons:**
- **Managed service only** - not self-hostable
- Requires Upstash account and cloud dependency
- Violates ClawDock's local-first philosophy

**Verdict: NOT SUITABLE** - Cloud dependency, not self-hostable

---

## 3. Comparison Matrix

| Feature | Workflow DevKit | Temporal | Inngest | Trigger.dev v3 | BullMQ |
|---------|-----------------|----------|---------|----------------|--------|
| **TypeScript Native** | Excellent | Good | Excellent | Excellent | Good |
| **Self-Hostable** | Yes (Node.js) | Yes (complex) | Partial | Coming soon | Yes |
| **Docker Simplicity** | Simple | 3+ containers | Dev only | Complex | Redis only |
| **Human-in-the-Loop** | Native | Native | Native | Manual | Manual |
| **Observability** | Built-in | Built-in | Built-in | Built-in | External |
| **Hono Integration** | Official | None | Manual | Manual | Manual |
| **Learning Curve** | Low | High | Low | Low | Low |
| **Maturity** | Beta | Production | Production | V3 Beta | Production |
| **Resource Usage** | Low | High | Medium | Medium | Low |

---

## 4. Recommendation

### Primary Recommendation: Workflow DevKit

**Why:**
1. **Perfect Hono integration** - Official adapter, no custom glue code
2. **Designed for our use case** - AI agents, long-running workflows, human-in-the-loop
3. **Self-hostable** - Runs on Node.js, containerizable
4. **Lightweight** - No complex infrastructure (unlike Temporal)
5. **TypeScript-native** - Full type safety with `"use workflow"` directive
6. **Observability built-in** - Time-travel debugging, traces, logs
7. **From Vercel** - Active development, well-funded

**Risk Mitigation:**
- It's in beta, but from a reputable source
- API is stable enough for production use
- We can abstract the workflow layer to swap if needed

### Fallback: BullMQ + Custom Patterns

**When to use:**
- If Workflow DevKit proves unstable
- If we need simpler, battle-tested infrastructure
- For simple job queues (non-orchestration)

**Implementation approach:**
- BullMQ Flows for DAG-based workflows
- Custom `WorkflowState` table for long waits
- API endpoints for human approval signals
- External observability (Redis insight, custom dashboard)

### Avoid

| Solution | Reason |
|----------|--------|
| Temporal | Overkill, high operational overhead |
| Trigger.dev v3 | Self-hosting not ready |
| Inngest | Self-hosting limited to dev server |
| Upstash Workflow | Cloud-only, violates local-first |

---

## 5. Implementation Notes

### 5.1 Workflow DevKit Integration

**Installation:**
```bash
pnpm add workflow
```

**Hono Integration:**
```typescript
// packages/server/src/workflows/build-pipeline.ts
import { sleep } from "workflow";

export async function buildPipeline(prdId: string) {
  "use workflow";
  
  // Step 1: Break down PRD into tasks
  const tasks = await breakdownPRD(prdId);
  
  // Step 2: Wait for human approval
  const approval = await waitForApproval(prdId);
  if (!approval) return { status: "rejected" };
  
  // Step 3: Execute each task (survives restarts)
  for (const task of tasks) {
    await executeTask(task);
  }
  
  // Step 4: Verify deployment
  await verifyDeployment(prdId);
  
  return { status: "complete" };
}

async function waitForApproval(prdId: string) {
  "use step";
  // Human-in-the-loop implementation
  // Uses Workflow DevKit's signal mechanism
}
```

**Docker Configuration:**
```yaml
# In agent's docker-compose.yml
services:
  gateway:
    # ... existing config
    environment:
      - WORKFLOW_PERSISTENCE=postgres  # or redis
```

### 5.2 Human-in-the-Loop Pattern

```typescript
// Gateway exposes approval endpoints
app.post('/api/workflows/:id/approve', async (c) => {
  const workflowId = c.req.param('id');
  const { approved } = await c.req.json();
  
  // Signal the waiting workflow
  await workflow.signal(workflowId, 'approval', { approved });
  
  return c.json({ status: 'signaled' });
});

// Workflow waits for signal
export async function buildWithApproval(prdId: string) {
  "use workflow";
  
  const tasks = await breakdownPRD(prdId);
  
  // Notify user that approval is needed
  await notifyApprovalNeeded(prdId, tasks);
  
  // Suspend until approval signal received
  const { approved } = await workflow.waitForSignal('approval');
  
  if (!approved) {
    return { status: 'rejected', reason: 'User rejected build' };
  }
  
  // Continue with approved build
  for (const task of tasks) {
    await executeTask(task);
  }
}
```

### 5.3 Observability Integration

Workflow DevKit provides built-in observability. Access via:

```typescript
// View workflow status
const status = await workflow.getStatus(workflowId);

// Get full execution history
const history = await workflow.getHistory(workflowId);

// Replay failed workflow from checkpoint
await workflow.replay(workflowId, { fromStep: 'executeTask' });
```

Gateway Dashboard Integration:
- Display active workflows
- Show step-by-step progress
- Provide approval UI
- Enable manual intervention (pause, resume, cancel)

---

## 6. Open Questions

### Needs Clarification

1. **Persistence Backend**: Workflow DevKit supports multiple backends. Which fits ClawDock?
   - PostgreSQL (already in stack) vs Redis vs SQLite
   - Research: Does it support sharing DB with other services?

2. **Workflow DevKit Production Readiness**: 
   - Is beta status acceptable for ClawDock's timeline?
   - What's their release schedule to stable?

3. **Recovery Semantics**:
   - How does it handle container restarts mid-workflow?
   - What's the exact checkpoint granularity?

4. **Scaling**:
   - Single worker sufficient for ClawDock?
   - How to scale if needed (multiple Gateway replicas)?

### Future Research

1. **Task Tracker Integration**: How do workflows update Task Tracker state?
2. **Memory Store Integration**: Can workflows access Memory Store during execution?
3. **Bay Trigger Integration**: How does Heartbeat trigger workflows?

---

## 7. Next Steps

1. **Prototype**: Build a minimal workflow with Workflow DevKit + Hono
2. **Test Human-in-the-Loop**: Implement approval flow end-to-end
3. **Evaluate Observability**: Check if built-in dashboard meets needs
4. **Stress Test**: Simulate restarts during workflow execution
5. **Document**: Create `contexts/WORKFLOW.md` for agent guidance

---

*End of Research Document*
