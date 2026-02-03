# Memory Store Research

> Researched: 2026-02-03

## Problem Statement

ClawDock needs a persistent Memory Store for agent memory across sessions. This is separate from task tracking and self-reflection systems. The Memory Store handles:

- **Conversation history summaries** - Compressed versions of past interactions
- **Facts, preferences, decisions** - Extracted knowledge the agent should remember
- **Entity tracking** - People, projects, concepts, and their relationships
- **Semantic search** - Finding relevant memories based on meaning, not just keywords

### Requirements

| Requirement | Details |
|-------------|---------|
| **Hybrid storage** | Vector DB for semantic search + file/structured storage for longer content |
| **Self-hostable** | Must run in Docker container |
| **API/CLI interface** | No browser or TUI dependency |
| **Postgres compatible** | We use Postgres with pgvector |
| **Node.js/TypeScript** | Compatible with Hono backend |

---

## Existing Solutions

### 1. Mem0 (mem0ai/mem0)

**What it is:** Universal memory layer for AI agents. Apache 2.0 licensed, Y Combinator S24.

**Architecture:**
- Two-phase pipeline: Extraction + Update
- Multi-level memory: User, Session, and Agent state
- Hybrid storage: Vector (pgvector) + Graph (Neo4j optional)
- Automatic fact extraction and entity linking

**Key Features:**
- `memory.add()` - Add memories from conversation
- `memory.search()` - Semantic search over memories
- Multi-user/multi-session support
- Automatic summarization and consolidation
- 26% better accuracy vs OpenAI Memory on LOCOMO benchmark
- 91% faster, 90% fewer tokens than full-context

**Stack:**
```
Vector DB: pgvector, Qdrant, Chroma, Pinecone, Milvus, Weaviate
Graph DB: Neo4j (optional)
LLM: OpenAI (default), supports alternatives
SDKs: Python (primary), JavaScript/npm (mem0ai)
```

**Pros:**
- Actively maintained (v1.0.0 released 2025)
- pgvector support out of the box
- JavaScript/npm SDK available
- Hybrid vector + graph architecture
- Well-documented, production-ready

**Cons:**
- Python-first (TypeScript SDK is secondary)
- Graph features require Neo4j (additional dependency)
- Self-hosted requires running their Python service
- No native Hono integration

**Assessment for ClawDock:** Strong candidate, but Python-centric. Would need to run as separate service or port logic to TypeScript.

---

### 2. Zep (getzep/zep)

**What it is:** End-to-end context engineering platform for AI agents.

**Current Status (2025):**
- **Community Edition is DEPRECATED** - moved to `legacy/` folder
- Main focus is Zep Cloud (commercial)
- Open-source repo now contains only examples and integrations
- Graph memory powered by Graphiti framework

**Architecture (when it was OSS):**
- PostgreSQL + pgvector for storage
- Automatic summarization of old messages
- Entity extraction and tagging
- Temporal memory decay (older facts fade)
- Vector search with metadata filtering

**Key Features (Cloud only now):**
- Graph Memory (entities + relationships)
- Sub-200ms retrieval latency
- Hybrid search (semantic + metadata)
- TypeScript SDK available

**Pros:**
- Was well-designed for chat memory
- TypeScript SDK exists
- Postgres/pgvector native

**Cons:**
- **Open-source version no longer supported**
- Advanced features (Graph Memory) only in Cloud
- Cannot self-host modern features
- Would need to use legacy code or fork

**Assessment for ClawDock:** Not viable. OSS version deprecated. Would need to fork legacy code (risky maintenance burden).

---

### 3. Graphiti (getzep/graphiti)

**What it is:** Open-source temporal knowledge graph framework (powers Zep Cloud).

**Architecture:**
- Real-time incremental graph updates
- Bi-temporal data model (event time + ingestion time)
- Hybrid retrieval: semantic + keyword (BM25) + graph traversal
- Custom entity types via Pydantic models

**Database Support:**
- Neo4j 5.26+
- FalkorDB 1.1.2+
- Kuzu 0.11.2+
- Amazon Neptune

**Key Features:**
- Episodes = units of data ingestion
- Nodes = entities with embeddings
- Edges = relationships with temporal validity
- MCP server for Claude/Cursor integration
- REST API via FastAPI

**Pros:**
- Actively maintained, OSS (Apache 2.0)
- Superior to GraphRAG for dynamic data
- Temporal awareness (knows when facts changed)
- MCP server available

**Cons:**
- Python-only
- Requires Neo4j/FalkorDB (not Postgres)
- Complex architecture for our needs
- No native pgvector support

**Assessment for ClawDock:** Interesting for knowledge graphs, but too complex and requires Neo4j. Not a fit for our Postgres-first approach.

---

### 4. Letta (formerly MemGPT)

**What it is:** Agentic OS for building stateful LLM applications with infinite memory.

**Architecture:**
- Treats LLM context as RAM, external storage as disk
- **Core Memory:** Fixed context the agent "knows" (persona, user info)
- **Archival Memory:** Vector DB for long-term facts
- **Recall Memory:** Complete event log of all interactions

**Deployment:**
```bash
docker run -p 8283:8283 \
  -e LETTA_SERVER_PASS=your_password \
  -v ~/.letta:/root/.letta \
  letta/letta:latest
```

**Stack:**
- PostgreSQL + pgvector for storage
- Runs as persistent server
- Web UI (ADE) + CLI + REST API
- Multi-LLM support (OpenAI, Anthropic, Ollama)

**Key Features:**
- Agent explicitly decides what to remember
- Self-editing memory (agent can update its own persona)
- Multi-agent orchestration
- Provider agnostic

**Pros:**
- Self-hostable via Docker
- Postgres/pgvector support
- REST API available
- Python SDK, potentially callable from Node

**Cons:**
- Python-only (no TypeScript SDK)
- Heavy framework (entire agent system, not just memory)
- Opinionated architecture
- Would need to run as separate service

**Assessment for ClawDock:** Interesting architecture, but too heavy. It's an entire agent framework, not a memory library. Overkill for our needs.

---

### 5. LangChain/LangGraph Memory (TypeScript)

**What it is:** Memory components from the LangChain ecosystem.

**Components:**
```typescript
// Chat History (short-term)
import { PostgresChatMessageHistory } from "@langchain/postgres";

// Semantic Memory (long-term)
import { PGVectorStore } from "@langchain/postgres";

// Agent State Persistence
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
```

**Pros:**
- Native TypeScript
- Direct pgvector integration
- Well-documented
- Modular (use what you need)

**Cons:**
- Not a complete memory solution
- No automatic fact extraction
- No entity tracking
- Need to build extraction/summarization logic
- Tied to LangChain ecosystem

**Assessment for ClawDock:** Good building blocks, but we'd need to build the "smart" layer ourselves.

---

### 6. Custom Build with pgvector

**Pattern:** The "Pointer-to-Blob" architecture.

```
┌─────────────────────────────────────────────────────────────┐
│                      Postgres + pgvector                     │
├─────────────────────────────────────────────────────────────┤
│  memories table                                              │
│  ├── id: uuid                                                │
│  ├── embedding: vector(1536)                                 │
│  ├── content_summary: text (short)                           │
│  ├── content_uri: text (pointer to full content)             │
│  ├── entity_refs: jsonb (linked entities)                    │
│  ├── user_id: text                                           │
│  ├── session_id: text                                        │
│  ├── created_at: timestamp                                   │
│  └── metadata: jsonb                                         │
├─────────────────────────────────────────────────────────────┤
│  entities table                                              │
│  ├── id: uuid                                                │
│  ├── name: text                                              │
│  ├── type: text (person, project, concept)                   │
│  ├── embedding: vector(1536)                                 │
│  └── metadata: jsonb                                         │
├─────────────────────────────────────────────────────────────┤
│  File Storage (local or S3)                                  │
│  └── Full conversation transcripts, documents                │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Full control
- Native Postgres (no additional services)
- TypeScript native
- Exactly what we need, nothing more

**Cons:**
- Must implement extraction logic
- Must implement summarization
- Must implement entity resolution
- More development time

---

## Comparison Matrix

| Solution | License | Self-Host | TypeScript | pgvector | Entity Tracking | Complexity |
|----------|---------|-----------|------------|----------|-----------------|------------|
| **Mem0** | Apache 2.0 | Yes (Python service) | SDK available | Yes | Yes (with Neo4j) | Medium |
| **Zep** | Apache 2.0 | No (deprecated) | SDK available | Was yes | Was yes | N/A |
| **Graphiti** | Apache 2.0 | Yes | No | No (Neo4j) | Yes | High |
| **Letta** | Apache 2.0 | Yes | No | Yes | Yes | High |
| **LangChain** | MIT | N/A | Yes | Yes | No | Low |
| **Custom** | N/A | Yes | Yes | Yes | Build it | Medium-High |

---

## Recommendation

### Decision: **Fork + Adapt Mem0 Logic**

**Rationale:**

1. **Mem0 is the closest fit** - It's designed exactly for our use case (agent memory, not full agent framework)

2. **Their architecture is proven** - 26% accuracy improvement, published paper, production-ready

3. **pgvector support exists** - We don't need to add a new database

4. **The logic is portable** - Their core extraction/update pipeline can be implemented in TypeScript

**Implementation Strategy:**

```
Phase 1: Build Core Memory Layer (TypeScript/Hono)
├── Port Mem0's extraction pipeline to TypeScript
├── Use pgvector directly (no Python dependency)
├── Implement basic CRUD + semantic search
└── Store full content in files, summaries in vectors

Phase 2: Add Entity Tracking
├── Extract entities using LLM (like Mem0)
├── Store in Postgres (not Neo4j)
├── Link memories to entities
└── Enable entity-based queries

Phase 3: Advanced Features (Optional)
├── Conversation summarization
├── Memory consolidation (merge similar memories)
└── Temporal decay (relevance scoring)
```

**Why not use Mem0 directly?**
- Python service adds operational complexity
- TypeScript SDK is thin wrapper, not full functionality
- We want tighter integration with Hono backend
- Control over storage format

**Alternative considered:** LangChain building blocks + custom extraction. This would work but requires more from-scratch development. Mem0's patterns give us a proven blueprint.

---

## Implementation Notes

### Schema Design

```sql
-- Core memories table
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  user_id TEXT,
  agent_id TEXT,
  memory_type TEXT DEFAULT 'fact', -- fact, preference, event, entity
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entity tracking
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- person, project, concept, organization
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  UNIQUE(name, entity_type)
);

-- Memory-Entity relationships
CREATE TABLE memory_entities (
  memory_id UUID REFERENCES memories(id),
  entity_id UUID REFERENCES entities(id),
  relationship TEXT, -- mentions, about, from
  PRIMARY KEY (memory_id, entity_id)
);

-- Indexes
CREATE INDEX ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON entities USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON memories(user_id);
CREATE INDEX ON memories(agent_id);
```

### Core API (Hono)

```typescript
// Memory Store API routes
app.post('/memory/add', async (c) => {
  // Extract facts from conversation
  // Generate embeddings
  // Store in pgvector
  // Extract and link entities
});

app.post('/memory/search', async (c) => {
  // Semantic search with filters
  // Return relevant memories
});

app.get('/memory/entities', async (c) => {
  // List tracked entities
});

app.get('/memory/:id', async (c) => {
  // Get specific memory
});
```

### Memory Extraction Pipeline

```typescript
interface MemoryExtractor {
  // Use LLM to extract facts from conversation
  extractFacts(messages: Message[]): Promise<Fact[]>;
  
  // Extract entities mentioned
  extractEntities(text: string): Promise<Entity[]>;
  
  // Generate summary if content is long
  summarize(content: string): Promise<string>;
  
  // Resolve duplicates/conflicts
  consolidate(newFact: Fact, existing: Fact[]): Promise<Fact>;
}
```

### Hybrid Storage Pattern

```typescript
// For short content: store directly in Postgres
if (content.length < 2000) {
  await db.insert(memories).values({
    content,
    embedding: await embed(content),
    // ...
  });
}

// For long content: store summary + file reference
else {
  const fileUri = await saveToStorage(content);
  const summary = await summarize(content);
  
  await db.insert(memories).values({
    content: summary,
    embedding: await embed(summary),
    metadata: { fullContentUri: fileUri },
    // ...
  });
}
```

---

## Open Questions

1. **Graph database necessity?** - Mem0 uses Neo4j for entity relationships. Can we model this adequately in Postgres with junction tables, or do we need graph queries?

2. **Embedding model choice** - OpenAI `text-embedding-3-small` (1536 dims) vs smaller local models? Tradeoff between quality and self-hosting.

3. **Memory consolidation frequency** - How often should we merge/summarize old memories? Background job? On-demand?

4. **Multi-agent memory sharing** - Should agents share memories? Have private + shared pools?

5. **Conversation context window** - How many recent messages to keep in "working memory" vs commit to long-term?

6. **LLM for extraction** - Use same LLM as agent, or dedicated smaller model for extraction/summarization?

---

## References

- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Mem0 Paper: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/html/2504.19413v1)
- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [Letta Documentation](https://docs.letta.com)
- [LangChain Postgres Memory](https://js.langchain.com/docs/integrations/memory/postgres)
- [pgvector](https://github.com/pgvector/pgvector)
