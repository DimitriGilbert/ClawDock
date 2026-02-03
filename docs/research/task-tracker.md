# Task Tracker Research

> Research for ClawDock's agent-centric task management system.
> Last updated: 2026-02-03

---

## 1. Problem Statement

ClawDock needs an internal Task Tracker for the agent (Clawthis) to organize its own work. This is **not** a user-facing project management tool - it's the agent's private todo list.

### Core Requirements

| Requirement | Description |
|-------------|-------------|
| **API-only** | Agent is primary consumer; Gateway provides visibility UI |
| **Hybrid prioritization** | Rule-based automatic + AI-overridable |
| **Self-hostable** | Must run in Docker container |
| **Postgres** | Using shared Postgres instance (with pgvector) |
| **Node.js/TypeScript** | Compatible with Hono + tRPC stack |
| **Task dependencies** | Track blocked/blocking relationships |
| **Multi-source ingestion** | Accept tasks from all Bays (chat, email, RSS) |

### Key Insight from VISION.md

> "Task Tracker and Prompt Manager are API-only - the Agent is the consumer. This dramatically reduces complexity."

This means we're building a lightweight internal service, not a full project management tool.

---

## 2. Existing Solutions Evaluated

### 2.1 Vikunja

**Website**: [vikunja.io](https://vikunja.io)  
**Repo**: [go-vikunja/vikunja](https://github.com/go-vikunja/vikunja) (3.2k stars)  
**Language**: Go (backend) + Vue (frontend)  
**License**: AGPL-3.0

#### Features
- Full REST API with OpenAPI/Swagger docs at `/api/v1/docs`
- Projects, tasks, subtasks, labels, priorities
- Task relations (dependencies)
- Kanban boards, Gantt charts
- Webhooks for external integrations
- CalDAV support
- Multi-user with teams and permissions

#### Postgres Support
Full native support via environment variables:
```yaml
environment:
  VIKUNJA_DATABASE_TYPE: postgres
  VIKUNJA_DATABASE_HOST: db
  VIKUNJA_DATABASE_USER: vikunja
  VIKUNJA_DATABASE_DATABASE: vikunja
```

#### Pros
- **Feature-complete**: Already solves task management comprehensively
- **Self-hostable**: Official Docker images, well-documented
- **Active development**: v1.0.0 released Jan 2026, 97 contributors
- **API-first friendly**: Full REST API, OpenAPI spec available
- **Lightweight**: Single Go binary, efficient resource usage

#### Cons
- **No official TypeScript SDK**: Would need to generate from OpenAPI spec
- **Over-featured for our needs**: Includes UI, CalDAV, multi-user which we don't need
- **AGPL license**: Copyleft concerns if we modify significantly
- **Go-based**: Doesn't integrate natively with our Node.js stack

#### Verdict: **Good candidate if we use as external service**

---

### 2.2 Plane.so

**Website**: [plane.so](https://plane.so)  
**Repo**: [makeplane/plane](https://github.com/makeplane/plane)  
**Language**: Python (Django) + Next.js  
**License**: AGPL-3.0

#### Features
- Issues, cycles, modules, pages
- Rich text editor, file attachments
- GitHub/GitLab integration
- Roadmaps, analytics

#### Pros
- Modern, Linear-like experience
- Self-hostable with Docker
- Active community

#### Cons
- **Very heavy**: Full Django + Next.js stack
- **No documented public API**: API exists but not developer-focused
- **Overkill**: Designed for team project management, not agent todos
- **Resource intensive**: Multiple containers required

#### Verdict: **Too heavy for our use case**

---

### 2.3 OpenProject

**Website**: [openproject.org](https://openproject.org)  
**Language**: Ruby on Rails  
**License**: GPL-3.0

#### Features
- Work packages (tasks), Gantt, Kanban
- HAL+JSON REST API (v3)
- Team collaboration

#### Pros
- Enterprise-grade
- Well-documented API

#### Cons
- **Very heavy**: Ruby on Rails, requires significant resources
- **Complex API**: HAL+JSON requires specific handling
- **Enterprise focus**: Far too complex for agent todos

#### Verdict: **Not suitable**

---

### 2.4 Super Productivity

**Website**: [super-productivity.com](https://super-productivity.com)  
**License**: MIT

#### Features
- Time tracking, pomodoro
- JIRA/GitHub/GitLab integration
- Local-first

#### Pros
- Privacy-focused
- Lightweight Electron app

#### Cons
- **No server API**: Desktop app, local storage only
- **Not headless**: Requires UI interaction

#### Verdict: **Not suitable - no API**

---

### 2.5 Build Custom (Hono + tRPC + Drizzle)

Using our existing Better-T-Stack foundation.

#### Approach
Build a minimal task API service as part of ClawDock's monorepo.

#### Schema (Drizzle)
```typescript
// Minimal schema for agent task management
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').default(0),
  source: text('source'), // 'chat', 'email', 'rss', 'agent'
  sourceId: text('source_id'), // Reference to Bay message
  dueDate: timestamp('due_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  metadata: jsonb('metadata'), // Flexible extra data
});

export const taskDependencies = pgTable('task_dependencies', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id),
  dependsOnId: integer('depends_on_id').references(() => tasks.id),
});
```

#### Pros
- **Perfect fit**: Exactly what we need, no more
- **Native stack**: TypeScript, Hono, tRPC, Drizzle
- **Type-safe**: End-to-end TypeScript types
- **Low complexity**: 200-300 lines of code for core functionality
- **No additional container**: Runs in Gateway service

#### Cons
- **Build time**: Need to implement from scratch
- **No existing ecosystem**: No plugins, webhooks built-in
- **Maintenance burden**: We own all the code

#### Verdict: **Best option given "Low complexity" designation**

---

### 2.6 Hybrid: Vikunja API + TypeScript SDK

Use Vikunja as external service, generate TypeScript SDK from OpenAPI.

```bash
# Generate SDK from Vikunja's OpenAPI spec
npx openapi-typescript-codegen \
  --input https://try.vikunja.io/api/v1/docs.json \
  --output ./packages/vikunja-sdk \
  --client axios
```

#### Pros
- Get mature task management immediately
- Generate type-safe SDK
- Decouple task storage from Gateway

#### Cons
- Additional container to manage
- Over-featured
- External dependency

#### Verdict: **Viable if we want separation, but overkill**

---

## 3. Recommendation: **Build Simple API**

### Decision: Build

Given the VISION.md designation of "Low complexity" and the requirement that the agent is the primary consumer, **building a simple internal API is the right choice**.

### Justification

| Factor | Find | Fork | Build |
|--------|------|------|-------|
| Complexity alignment | Over-featured | Over-featured | Perfect fit |
| Stack compatibility | Go (Vikunja) | Mixed | Native TS |
| Container overhead | +1 container | +1 container | 0 (in Gateway) |
| Time to implement | 1-2 hours setup | Variable | 4-8 hours |
| Maintenance | External | Complex | Simple |
| Type safety | Generate SDK | Variable | Native |

### What to Build

A `TaskService` within the Gateway package with:

1. **CRUD operations** for tasks
2. **Priority queue** with configurable rules
3. **Dependency tracking** (blocked by / blocks)
4. **Source tracking** (which Bay created the task)
5. **Status workflow** (pending -> in_progress -> completed)
6. **tRPC procedures** for agent consumption

### Not Building (Keep Simple)

- Multi-user / permissions (single agent)
- UI (Gateway provides visibility)
- Webhooks (Heartbeat handles triggers)
- Kanban / Gantt (visualization in Gateway if needed)
- Time tracking
- CalDAV

---

## 4. Implementation Notes

### 4.1 Database Schema

```sql
-- Core task table
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  source TEXT, -- 'chat' | 'email' | 'rss' | 'agent' | 'heartbeat'
  source_ref TEXT, -- ID from source system
  parent_id INTEGER REFERENCES tasks(id),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Dependencies (task A depends on task B)
CREATE TABLE task_dependencies (
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id)
);

-- Index for quick "what's next" queries
CREATE INDEX idx_tasks_priority ON tasks(priority DESC, created_at ASC) 
  WHERE status = 'pending';
```

### 4.2 tRPC Router

```typescript
// packages/api/src/routers/tasks.ts
export const tasksRouter = router({
  // Create task from any source
  create: protectedProcedure
    .input(createTaskSchema)
    .mutation(({ input, ctx }) => {
      return ctx.db.insert(tasks).values(input).returning();
    }),
  
  // Get next task to work on (respects priorities and dependencies)
  getNext: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.query.tasks.findFirst({
        where: and(
          eq(tasks.status, 'pending'),
          notExists(
            ctx.db.select()
              .from(taskDependencies)
              .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
              .where(and(
                eq(taskDependencies.taskId, tasks.id),
                ne(tasks.status, 'completed')
              ))
          )
        ),
        orderBy: [desc(tasks.priority), asc(tasks.createdAt)],
      });
    }),
  
  // Update task status
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: taskStatusSchema }))
    .mutation(({ input, ctx }) => {
      const updates: Partial<Task> = { 
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.status === 'completed') {
        updates.completedAt = new Date();
      }
      return ctx.db.update(tasks)
        .set(updates)
        .where(eq(tasks.id, input.id))
        .returning();
    }),
    
  // Override priority (AI decision)
  setPriority: protectedProcedure
    .input(z.object({ id: z.number(), priority: z.number() }))
    .mutation(({ input, ctx }) => {
      return ctx.db.update(tasks)
        .set({ priority: input.priority, updatedAt: new Date() })
        .where(eq(tasks.id, input.id))
        .returning();
    }),
});
```

### 4.3 Priority Rules (Automatic)

```typescript
// packages/api/src/services/priority.ts
export function calculatePriority(task: CreateTaskInput): number {
  let priority = 0;
  
  // Source-based priority
  const sourcePriorities: Record<string, number> = {
    'chat': 100,      // Direct user request
    'email': 50,      // Async but intentional
    'heartbeat': 25,  // System-generated
    'rss': 10,        // Background info
    'agent': 75,      // Agent self-generated
  };
  priority += sourcePriorities[task.source] ?? 0;
  
  // Urgency keywords
  const urgentPatterns = /\b(urgent|asap|critical|important)\b/i;
  if (urgentPatterns.test(task.title) || urgentPatterns.test(task.description ?? '')) {
    priority += 50;
  }
  
  // Due date proximity
  if (task.dueDate) {
    const hoursUntilDue = (task.dueDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue < 1) priority += 100;
    else if (hoursUntilDue < 24) priority += 50;
    else if (hoursUntilDue < 72) priority += 25;
  }
  
  return priority;
}
```

### 4.4 Agent Integration

The agent (via OpenCode) will interact with tasks through the API:

```typescript
// Example: Agent creating a task from email processing
await trpc.tasks.create.mutate({
  title: "Reply to support request from john@example.com",
  description: "User asking about feature X. Need to investigate and respond.",
  source: "email",
  sourceRef: "email-msg-12345",
  priority: await trpc.tasks.calculatePriority({ ... }),
});

// Example: Agent getting next work item
const nextTask = await trpc.tasks.getNext.query();
if (nextTask) {
  await trpc.tasks.updateStatus.mutate({ id: nextTask.id, status: 'in_progress' });
  // ... do work ...
  await trpc.tasks.updateStatus.mutate({ id: nextTask.id, status: 'completed' });
}
```

---

## 5. Open Questions

### Resolved

| Question | Decision |
|----------|----------|
| Build vs Find? | Build simple internal API |
| Where does it run? | In Gateway service (no separate container) |
| Database? | Shared Postgres instance |

### Needs Clarification

1. **Task archival**: How long to keep completed tasks? Options:
   - Keep forever (simple, grows unbounded)
   - Archive after N days to separate table
   - Delete after N days

2. **Subtasks vs Dependencies**: Should we support subtasks (hierarchical) or just dependencies (graph)?
   - Current proposal: Both - `parent_id` for hierarchy, `task_dependencies` for blocking

3. **Agent self-auditing**: Should the agent be able to modify its own task priorities, or only observe rules?
   - VISION.md says "AI-overridable" so yes, agent can override

4. **History/Audit log**: Do we need to track all status changes for debugging?
   - Probably useful during development

5. **Integration with Memory Store**: Should completed tasks automatically become memories?
   - Likely yes, but Memory Store research needed first

---

## 6. Summary

| Aspect | Decision |
|--------|----------|
| **Approach** | Build simple API |
| **Location** | Gateway service |
| **Database** | Postgres (shared) |
| **API** | tRPC procedures |
| **Complexity** | ~300 lines of core code |
| **Timeline** | 4-8 hours to implement |

### Next Steps

1. Create Drizzle schema in `packages/db/src/schema/tasks.ts`
2. Implement tRPC router in `packages/api/src/routers/tasks.ts`
3. Add priority calculation service
4. Create basic Gateway UI for task visibility
5. Document MCP-style tool interface for agent consumption

---

*Document version: 1.0*
