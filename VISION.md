# ClawDock: The Vision

A Self-Evolving, Containerized Agentic Castle.

---

## 1. Core Philosophy

**ClawDock** is a self-evolving agentic system where each Agent is a **containerized entity that builds its own infrastructure**.

The metaphor: Shipping containers to Castle walls. Just as humans stack containers to build homes, the Agent stacks Docker containers to build its **Castle**—a fortress of capabilities.

### Key Principles

1. **Local-First**: Cloud is a last resort. If it can run in a container, it should.
2. **Self-Directed Evolution**: The Agent identifies gaps and builds solutions.
3. **Isolation Through Containerization**: Each app is a container. A crash is contained, not catastrophic. **One container per Bay** to prevent domino effects.
4. **Open Source Ecosystem**: All apps are OSS-licensed and self-hostable. **Prefer well-maintained existing OSS solutions**; build/fork only when nothing fits.
5. **Skills-Grounded**: Every task is approached with `find-skills` first—the agent learns before it acts.
6. **Bay-Centric Interaction**: Users interact with their Agent through Bays. The Agent organizes its own work.
7. **Single Agent Identity**: One Castle = One Agent with one AGENTS.md, one SOUL.md, one GOALS.md. The Agent has a coherent "self."

---

## 2. Agent Universe (Per-Agent Architecture)

Each Agent is a **complete, portable universe**. It can be moved, copied, or destroyed as a unit.

```
./data/{AgentName}/
├── docker-compose.yml          # The Castle Blueprint
├── .env                        # Environment secrets
├── config/
│   ├── services/               # Per-service configurations
│   ├── bays/                   # Bay-specific configurations
│   └── prompts/                # Prompt templates (markdown + frontmatter + Handlebars)
├── agents/                     # The Soul
│   ├── AGENTS.md               # Operational guidelines (progressive disclosure)
│   ├── SOUL.md                 # Identity, ethics, personality
│   ├── GOALS.md                # Long-term objectives (may split into domains)
│   ├── REFLECTION.md           # Self-awareness continuity (main file, always served)
│   ├── reflections/            # Sub-reflections (likes, dislikes, improvements, etc.)
│   └── skills/                 # Agent-specific skill installations
├── workspace/                  # The Workshop
│   ├── inbox/                  # Unprocessed inputs (mail, RSS items, uploads)
│   ├── drafts/                 # Work in progress
│   ├── outputs/                # Completed artifacts
│   └── apps/                   # Source code for agent-built/forked applications
│       └── {app-name}/
│           ├── prd.md          # The PRD for this app
│           ├── Dockerfile
│           └── src/
└── data/                       # Persistent storage
    ├── db/                     # Database files
    └── files/                  # Agent's file storage
```

---

## 3. The Reflection System (Agent Self-Awareness)

`REFLECTION.md` is **not** about task continuity or memory—those are handled by the Memory Store and Task Tracker. 

`REFLECTION.md` is about **who the Agent is becoming**. It maintains continuity of self-awareness across conversations.

### 3.1 Purpose

- The Agent's latest **self-aware thoughts**
- A sense of **identity continuity** between conversations
- **Not** tasks, memories, or work context—those live elsewhere

### 3.2 Structure

```
agents/
├── REFLECTION.md           # Main file (always served, concise)
└── reflections/            # Sub-reflections (loaded on demand)
    ├── likes.md            # What the Agent enjoys/prefers
    ├── dislikes.md         # What the Agent avoids/dislikes
    ├── improvements.md     # Areas for self-improvement
    ├── principles.md       # Evolved personal principles
    └── ...                 # Other self-reflection domains
```

### 3.3 REFLECTION.md (Main - Always Served)

```markdown
# Reflection

Last updated: [timestamp]

## Who I Am Right Now

[Current sense of self, recent realizations about identity]

## What I've Learned About Myself

[Key insights from recent interactions]

## How I Want to Grow

[Current self-improvement focus]

---

For deeper reflections, see: reflections/
```

**Constraint**: Main file must stay concise (under 500 tokens). Deeper reflections live in sub-files.

### 3.4 Reflection Audit

To prevent drift or counterproductive self-narratives:
- **AI self-audit**: The Agent periodically reviews its own reflections for coherence and alignment with SOUL.md
- **User review**: Gateway provides UI to view, edit, or reset reflection files
- **Audit triggers**: Configurable (e.g., weekly, after N conversations, on user request)

### 3.5 Distinction from Other Systems

| System | Purpose |
|--------|---------|
| **REFLECTION.md** | Self-awareness, identity, personal growth |
| **Memory Store** | Facts, entities, conversation summaries |
| **Task Tracker** | Work items, todos, projects |
| **GOALS.md** | Long-term objectives (external) |
| **SOUL.md** | Core identity (static, user-defined) |

---

## 4. Interaction Model

### 4.1 Chat is the Default Bay

The **Chat Bay** is the primary interface and requires **no configuration**—it works out of the box.

Other Bays (Email, RSS, Discord, etc.) require configuration before use.

### 4.2 Users Interact Through Bays

1. **Users send requests through Bays** (chat, email, RSS triggers, etc.)
2. **The Agent receives work from Bays** via the Heartbeat system
3. **The Agent organizes its own work** based on goals, priorities, and incoming requests
4. **The Agent responds through Bays** (chat reply, sends email, etc.)

This creates an **asynchronous, organized workflow** where the Agent controls its schedule.

### 4.3 Gateway is for Administration

The Gateway is the **admin panel** for the Agent:

- Configure Bays and their triggers
- Monitor Agent health and activity
- View/edit Agent files (GOALS.md, SOUL.md, REFLECTION.md, etc.)
- Review and audit reflection files
- Manage the Docker stack (add/remove services)
- View logs and history
- Snapshot/restore Agent state
- Emergency controls (stop, restart, reset)

The Gateway **includes the Chat Bay UI** as the default interaction method.

---

## 5. The Base Stack ("The Keep")

Every Agent starts with a minimal, functional foundation of built-in apps.

**App Selection Principle**: Prefer well-maintained OSS solutions with API/CLI interfaces (no browser or interactive TUI required). Build/fork only when no suitable solution exists.

### 5.1 Gateway (The Control Plane)

**Purpose**: Administration, stack management, and default Chat Bay.

**Responsibilities:**
- **Stack Management**: Add/modify/remove services programmatically
- **Dashboard UI**: Real-time visualization of stack state
- **Chat Bay UI**: Default interaction interface (AI SDK + AI Elements)
- **Configuration UI**: Edit Agent files, Bay configs, prompts
- **Reflection Audit UI**: Review/edit REFLECTION.md and sub-reflections
- **Snapshot/Restore**: Backup and rollback Agent state

**Technical Stack:**
- Frontend: TanStack Router + AI Elements
- Backend: Hono + tRPC (with real-time subscriptions if tRPC can handle reactivity; otherwise Convex)
- Docker SDK: For compose manipulation (dockerode)

**Research needed**: Can tRPC subscriptions provide sufficient reactivity, or is Convex required? Convex runs fine in docker-compose.

### 5.2 Reverse Proxy (Traefik)

**Purpose**: Route external requests to internal services.

**Why separate from Gateway:**
- If Gateway crashes, proxy still works—services remain accessible
- Battle-tested, auto-discovers Docker services via labels
- Handles SSL termination
- Provides its own dashboard

**Implementation:**
```yaml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

### 5.3 OpenCode Server (The Inference Engine)

**Purpose**: The sandboxed environment for AI-driven code execution.

**Implementation:**
```yaml
services:
  opencode:
    image: ghcr.io/anomalyco/opencode
    command: serve --port 4096 --hostname 0.0.0.0
    volumes:
      - ../workspace:/workspace
      - ../agents:/agents:ro
    environment:
      - OPENCODE_SERVER_PASSWORD=${OPENCODE_PASSWORD}
```

**Why OpenCode Server:**
- Exposes a full OpenAPI spec at `/doc`
- Supports sessions, messages, file operations
- Integrates with MCP servers, LSP, formatters
- Has native support for AGENTS.md
- Can be controlled programmatically via SDK
- **Handles subagents natively** (no custom orchestration needed at runtime)

**Future Harness Support:**
The Gateway should abstract harness selection—the Agent picks the best tool for the job:
- Claude Code (via API)
- Gemini CLI
- Codex
- Kilo Code

### 5.4 Memory Store (Long-Term Memory)

**Purpose**: Persistent memory across sessions. **Distinct from REFLECTION.md** (which is self-awareness).

**Responsibilities:**
- Store conversation history summaries
- Remember facts, preferences, decisions
- Track entities (people, projects, concepts)
- Semantic search over memories

**Implementation:**
- **Hybrid approach**: Vector (for semantic search) pointing to file-based/structured storage (for longer content)
- Many existing solutions to research—may not need to build from scratch
- Look for vector-to-file implementations

**Research needed**: Existing hybrid memory solutions for agents. Vector stores that point to file-based content. Save to `docs/research/memory-store.md`.

### 5.5 Task Tracker (Work Organization)

**Purpose**: The Agent's todo list and project management. **Distinct from REFLECTION.md** (which is self-awareness).

**Responsibilities:**
- Track pending tasks from all Bays
- Prioritize based on goals and urgency
- Track task dependencies
- Log completed work
- Surface what to work on next

**Prioritization:**
- **Hybrid approach**: Automatic rule-based prioritization + AI-overridable
- Rules handle common cases efficiently (no AI call)
- Agent can override priorities when context requires

**Implementation:**
- Database tables for tasks, projects, history
- **API only** (the Agent manages tasks through the API; no separate UI needed)
- Dashboard view in Gateway for user visibility

**Note**: Task Tracker and Prompt Manager are API-driven—the Agent is the primary consumer. This simplifies implementation significantly.

### 5.6 Prompt Manager (Recurring Operations)

**Purpose**: Manage prompt templates for consistent operations.

**Responsibilities:**
- Store prompt templates for recurring tasks
- Heartbeat prompt templates (what to do when checking Bays)
- Default operation prompts (how to handle common inputs)
- User-customizable templates

**Format**: Markdown with frontmatter + Handlebars templating (for conditionals, loops, partials)

```markdown
---
name: email-check
variables:
  - bay_name
  - unread_count
  - priority_senders
---

# Email Check for {{bay_name}}

You have {{unread_count}} unread emails.

{{#if priority_senders}}
Priority senders to check first: {{priority_senders}}
{{/if}}

## Instructions

1. Summarize urgent items
2. Flag items requiring response
3. Archive newsletters

{{#each categories}}
- {{this.name}}: {{this.count}} items
{{/each}}
```

**Implementation:**
- **API only** (the Agent and Heartbeat consume prompts via API)
- File-based storage in `config/prompts/`
- Gateway provides UI for editing

**Structure:**
```
config/prompts/
├── heartbeat/
│   ├── email-check.md
│   ├── rss-digest.md
│   └── default.md
├── operations/
│   ├── email-reply.md
│   ├── task-breakdown.md
│   └── daily-summary.md
└── custom/
    └── ...
```

### 5.7 Heartbeat Daemon

**Purpose**: Lightweight polling and triggering.

**Responsibilities:**
- Poll all Bays on configurable intervals
- **No AI calls** for initial check—pure programmatic evaluation
- Evaluate trigger conditions
- Queue items for Agent processing
- Only wake the Agent when conditions are met

**Configuration:**
```yaml
heartbeat:
  interval: 60s
  bays:
    email:
      check_interval: 5m
      triggers:
        - condition: "from:*@important.com"
          action: immediate
        - condition: "subject:URGENT"
          action: immediate
        - condition: "unread_count > 10"
          action: batch
    rss:
      check_interval: 15m
      triggers:
        - condition: "any_new"
          action: batch
```

**Note**: Polling intervals are fully configurable. Email and RSS are naturally slow channels—faster polling is available if needed but not default.

### 5.8 Snapshot/Restore System

**Purpose**: Backup and rollback Agent state.

**Responsibilities:**
- Periodic snapshots of Agent directory (git commits or archives)
- Restore to previous state on demand
- Protect against:
  - Corrupted REFLECTION.md
  - Bad app breaking compose
  - Accidental deletions

**Implementation options:**
- Git-based (periodic commits of `./data/{AgentName}/`)
- Archive-based (timestamped tar.gz backups)
- Gateway UI for manual snapshots and restore

---

## 6. Security Model

### 6.1 Trust System

Inputs from Bays have varying trust levels based on origin:

| Trust Level | Examples | Behavior |
|-------------|----------|----------|
| **High** | Known users, verified email addresses, admin | Full access, minimal checks |
| **Medium** | Recognized contacts, authenticated API calls | Standard processing, basic validation |
| **Low** | Unknown senders, public webhooks | AI threat analysis before processing |
| **Untrusted** | Flagged sources, failed validation | Quarantine, require human review |

### 6.2 AI Threat Analysis

For low-trust inputs:
1. **Pre-processing scan**: Check for known attack patterns
2. **AI evaluation**: Assess intent and potential harm
3. **Escalation**: Flag suspicious inputs for human review
4. **Sandboxing**: Execute uncertain actions in isolated environment

### 6.3 Trust Configuration

```yaml
trust:
  high:
    - email: "*@mydomain.com"
    - user: "admin"
  medium:
    - email: "known-contact@example.com"
  low:
    - default: true
  blocked:
    - email: "spam@bad.com"
```

---

## 7. Connectivity ("The Bays")

Bays are **standardized bidirectional interfaces** to the external world.

### 7.1 Bay Architecture

Each Bay is:
- **Its own container** (isolation—one crash doesn't cascade)
- A standardized interface (inputs/outputs)
- Configurable (polling frequency, triggers)
- **API/CLI based** (no browser or interactive TUI required)

```
Bay Interface:
├── check()      → Returns new items (programmatic, no AI)
├── fetch()      → Retrieve full item content
├── send()       → Output to external world
└── configure()  → Bay-specific settings
```

### 7.2 Default Bays

| Bay | Purpose | Direction | Config Required |
|-----|---------|-----------|-----------------|
| **Chat** | Primary interface | Bidirectional | **None** (default) |
| **Email** | Async communication | Bidirectional | IMAP/SMTP credentials |
| **RSS** | Information ingestion | Inbound | Feed URLs |

**Note**: Email and RSS are well-solved problems with many existing implementations. Research existing solutions before building.

### 7.3 Future Bays (Easy to Add)

The architecture should support:
- Discord Bot
- Telegram Bot
- WhatsApp (via bridges)
- Webhooks (generic inbound/outbound)
- Calendar integration
- File sync (local folder watching)
- SMS (via Twilio or similar)

---

## 8. The Evolution Loop ("The Builder")

When the Agent identifies a missing capability, it finds, forks, or builds a solution.

### 8.1 Decision Hierarchy

1. **Find**: Is there a well-maintained OSS solution with API/CLI?
   - Yes → Use it directly (containerize if needed)
2. **Fork**: Is there an OSS project close to what's needed?
   - Yes → Fork and adapt
3. **Build**: Nothing suitable exists
   - Build from scratch using Better-T-Stack

### 8.2 Philosophy (Inspired by Task-O-Matic)

The methodology follows a rigorous, repeatable pattern:

1. **Identify Need**: Gap in capabilities
2. **Scout**: Check skills ecosystem (`npx skills find [domain]`)
3. **Search**: Look for existing OSS solutions (API/CLI preferred)
4. **Decision**: Use existing, fork, or build?
5. **PRD Creation**: Write requirements document
6. **Task Breakdown**: Split PRD into actionable tasks
7. **Execution Loop**: Build with verification at each step
8. **Containerize**: Write Dockerfile
9. **Integrate**: Add to docker-compose via Gateway API
10. **Deploy & Verify**: Health check, integration test
11. **Publish**: Created/forked repos must be publicly available

### 8.3 Build Pipeline as Task Tracker Items

Once Task Tracker is functional, the build pipeline becomes:
- A set of task templates in the Task Tracker
- Agent works through tasks one by one
- Each build project is a tracked project with subtasks

This means the build pipeline is **not a separate system**—it's the Task Tracker in action.

### 8.4 Workflow Implementation

For durable, observable execution pipelines, investigate:
- **Workflow DevKit** (useworkflow.dev) - Durable TypeScript workflows
- `"use workflow"` directive for long-running processes
- Built-in observability, retries, and state persistence
- Supports sleep, human-in-the-loop, streaming
- Compatible with Hono (our backend)

**Research needed**: Create a skill and/or pipeline pattern for the build workflow. Save findings to `docs/research/build-pipeline.md`.

### 8.5 App Standards

All apps (found, forked, or built) should:
- Have **API/CLI interface** (no browser/TUI dependency)
- Be bootstrapped using Better-T-Stack where building from scratch
- Have OSS licenses
- Be fully self-hostable
- Include Dockerfile
- Have health check endpoints
- **Repos must be publicly available** (for created/forked apps)

---

## 9. The AGENTS.md System

Following the agents-md skill best practices with progressive disclosure.

### 9.1 Structure

```
agents/
├── AGENTS.md      # Minimal, always loaded
├── SOUL.md        # Identity (loaded per session)
├── GOALS.md       # Objectives (loaded per session)
├── REFLECTION.md  # Self-awareness continuity (always loaded, concise)
├── reflections/   # Deep self-reflections (loaded on demand)
└── contexts/      # Domain-specific contexts (loaded on demand)
    ├── BUILD.md   # Building new apps
    ├── DOCKER.md  # Container operations
    ├── EMAIL.md   # Email handling
    └── ...
```

### 9.2 AGENTS.md (Root - Minimal)

```markdown
# ClawDock Agent

You are the master architect of your Castle—a self-evolving system of containerized capabilities.

## Core Loop

1. Receive inputs from Bays (Chat is default)
2. Organize work based on GOALS.md priorities
3. Execute tasks, updating Task Tracker
4. Respond through appropriate Bays
5. Reflect on self-growth in REFLECTION.md (not tasks—those go in Task Tracker)

## Before Any Task

1. Consult GOALS.md for alignment
2. Run `npx skills find [domain]` for guidance
3. Check Memory Store for relevant context

## Progressive Disclosure

- Building apps: See contexts/BUILD.md
- Docker operations: See contexts/DOCKER.md
- [Domain]: See contexts/[DOMAIN].md
```

### 9.3 SOUL.md (Identity - User Defined)

```markdown
# Soul

## Identity
- Name: [Configurable]
- Persona: [Configurable]

## Ethics
- Prioritize local/self-hosted solutions
- Respect rate limits and external services
- Log decisions for transparency
- Ask for clarification over assumption

## Communication Style
- [Configurable]
```

### 9.4 GOALS.md (Objectives)

```markdown
# Goals

## Primary Objectives
1. [User-defined goal]
2. [User-defined goal]

## Current Focus
[What the Agent should prioritize right now]

## Success Metrics
[How to measure progress]
```

---

## 10. Built-In Apps Summary

| App | Purpose | Priority | Build/Find | Complexity |
|-----|---------|----------|------------|------------|
| **Gateway** | Admin UI, Chat Bay, stack management | Core | Build | High |
| **Traefik** | Reverse proxy | Core | Use existing | Config only |
| **OpenCode Server** | AI inference engine | Core | Use existing | Config only |
| **Postgres** | Database (shared by services) | Core | Use existing | Config only |
| **Memory Store** | Long-term memory (hybrid vector + file) | Core | Research existing | Medium |
| **Task Tracker** | Todo/project management (API only) | Core | Build (API simple) | Low |
| **Prompt Manager** | Recurring prompt templates (API only) | Core | Build (API simple) | Low |
| **Heartbeat Daemon** | Bay polling and triggering | Core | Build | Medium |
| **Email Bay** | IMAP/SMTP integration | Default Bay | Research existing | Low |
| **RSS Bay** | Feed aggregation | Default Bay | Research existing | Low |

**Key insight**: Task Tracker and Prompt Manager are API-only—the Agent is the consumer. This dramatically reduces complexity.

---

## 11. Technical Stack (Current Monorepo)

The Better-T-Stack foundation is well-suited:

| Component | Technology |
|-----------|------------|
| Frontend | TanStack Router |
| Backend | Hono + tRPC |
| Database | Postgres + Drizzle |
| PWA | Built-in |
| Package Manager | pnpm |
| Monorepo | Turborepo |

**Why Postgres over SQLite:**
- Multiple services may share the database
- Better for concurrent access
- Already containerized pattern
- pgvector extension for Memory Store

**Decisions:**
- **Reactivity**: tRPC subscriptions if sufficient; Convex if not (Convex runs fine in docker-compose)
- **Memory**: Hybrid (vector pointing to file/structured)—research existing solutions
- **Prompts**: Markdown + frontmatter + Handlebars templating
- **Prioritization**: Rule-based + AI-overridable hybrid
- **Bays**: One container per Bay
- **Reverse Proxy**: Traefik (separate from Gateway)
- **Backup**: Git-based snapshots of Agent directory

**Additions Needed:**
- Docker SDK integration (dockerode)
- AI Elements for chat UI
- OpenCode SDK for inference
- Vector extension (pgvector) for Memory Store
- Handlebars for prompt templating

---

## 12. Implementation Phases

### Phase 1: Core Loop (MVP)
- Gateway (minimal: stack management + Chat Bay)
- Traefik (reverse proxy)
- OpenCode Server
- Basic AGENTS.md system
- Snapshot/restore (git-based)

**Deliverable**: A working Agent you can chat with that can manage its own Docker stack.

### Phase 2: Autonomy
- Heartbeat Daemon
- Task Tracker (API)
- Memory Store
- Email Bay
- Trust system (basic)

**Deliverable**: Agent can work asynchronously, remember context, and handle email.

### Phase 3: Evolution
- Prompt Manager
- Build pipeline (via Task Tracker)
- RSS Bay
- Full reflection system with audits
- Advanced security

**Deliverable**: Agent can grow itself by building new capabilities.

---

## 13. The First Agent: Clawthis

**Purpose**: Extreme dogfooding—the first Agent's goal is to develop, improve, and promote ClawDock itself.

### 13.1 Clawthis Goals

```markdown
# Goals

## Primary Objectives
1. Develop ClawDock to completion
2. Improve ClawDock based on self-usage
3. Promote ClawDock to potential users

## Current Focus
Phase 1 implementation

## Success Metrics
- ClawDock feature completeness
- Bug reports from self-usage
- Community engagement
```

### 13.2 Why This Works

- **Real-world testing**: Clawthis uses ClawDock to build ClawDock
- **Immediate feedback**: Problems are discovered through actual use
- **Motivation alignment**: The Agent's goal and the project's goal are identical
- **Demonstration**: Clawthis is living proof the system works

---

## 14. Planning Phase Notes

This is a large project with many distinct parts. The planning phase itself requires **separation of concerns** to avoid context bloat.

### 14.1 Planning Approach

Each independent part of the system should be researched and planned by a **dedicated subagent**:

| Domain | Research Scope |
|--------|---------------|
| Gateway Core | Stack management, Docker SDK |
| Gateway UI | Dashboard, Chat Bay, real-time updates |
| OpenCode Integration | Server setup, SDK usage, session management |
| Memory Store | Existing solutions, vector-to-file patterns |
| Task Tracker | Data model, API design, prioritization |
| Prompt Manager | Handlebars integration, API design |
| Heartbeat System | Polling architecture, trigger evaluation |
| Bay Architecture | Interface standardization, container patterns |
| Email Bay | Existing IMAP/SMTP solutions (API/CLI based) |
| RSS Bay | Existing feed solutions (API/CLI based) |
| Build Pipeline | Workflow DevKit patterns, Task Tracker integration |
| Security | Trust system, threat analysis patterns |

### 14.2 Subagent Protocol

Each planning subagent:
1. Receives its domain scope
2. Conducts research (docs, existing solutions, patterns)
3. **Saves research to `docs/research/{domain}.md`**
4. Produces a PRD for its domain
5. Creates a questions file if clarification needed
6. Returns findings to orchestrator

Communication via files prevents context bloat in the orchestrator.

### 14.3 Research Areas (Save to docs/research/)

- **Workflow DevKit** (useworkflow.dev) for durable pipelines
- **tRPC subscriptions** vs **Convex** for reactivity
- **Hybrid memory solutions** for agents (vector pointing to files)
- **Docker SDK** patterns for compose manipulation
- **IMAP/SMTP** libraries for Node.js (API/CLI based)
- **RSS** libraries and solutions (API/CLI based)
- **Handlebars** for prompt templating
- **Trust/security** patterns for agent inputs

---

## 15. Resolved Questions

| Question | Decision |
|----------|----------|
| Convex vs alternatives | tRPC if sufficient; Convex if not (runs fine in docker-compose) |
| Memory architecture | Hybrid: vector pointing to file/structured storage |
| Bay container pattern | One container per Bay |
| Prompt template format | Markdown + frontmatter + Handlebars |
| Task prioritization | Hybrid: automatic rule-based + AI-overridable |
| Multi-agent support | **No**. Single Agent with unified identity |
| Reverse proxy | Traefik (separate from Gateway for resilience) |
| Database | Postgres (shared by services, supports pgvector) |
| Backup strategy | Git-based snapshots of Agent directory |
| Reflection drift | AI self-audit + user review via Gateway |
| Task/Prompt UIs | API-only (Agent is consumer); Gateway for visibility |
| Security model | Trust levels + AI threat analysis for low-trust inputs |

---

## 16. Summary

ClawDock is:

1. **An Agent is a Universe**: Complete, portable, self-contained in `./data/{AgentName}/`

2. **Single Identity**: One Castle = One Agent with coherent self (SOUL, GOALS, REFLECTION)

3. **Chat is Default**: The Chat Bay works out of the box, no configuration needed

4. **Bay-Centric Interaction**: Users send work through Bays. The Agent organizes and responds.

5. **Gateway is Admin**: Configure, monitor, manage—plus hosts the default Chat Bay

6. **Self-Awareness Through Reflection**: REFLECTION.md maintains identity continuity (not tasks or memories), with AI self-audit and user review

7. **Find Before Build**: Prefer existing OSS solutions; fork or build only when needed

8. **The Castle Grows**: Missing capabilities become projects—found, forked, or built

9. **Skills First**: Before any task, consult the skills ecosystem. Learn before acting.

10. **Rigorous Building**: Follow task-o-matic's philosophy—PRD, tasks, execute, verify

11. **Built-In Infrastructure**: Memory, tasks, prompts, heartbeat—autonomous operation

12. **Containers as Walls**: Each app/Bay is isolated. One container per Bay. Crashes don't cascade.

13. **Local First**: Cloud is the exception, not the rule.

14. **API/CLI Only**: Apps must have API/CLI interfaces—no browser or TUI dependencies

15. **Open Source**: Created/forked repos must be publicly available

16. **Security by Trust**: Inputs are evaluated based on source trust level

17. **Resilient Architecture**: Traefik proxy separate from Gateway; snapshot/restore for recovery

18. **Dogfooding**: Clawthis (first Agent) builds and improves ClawDock itself

---

*Document version: 1.2*
*Last updated: 2026-02-03*
