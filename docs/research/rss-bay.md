# RSS Bay Research

*Research Date: 2026-02-03*

---

## 1. Problem Statement

ClawDock needs an RSS Bay for information ingestion that:
- Parses RSS/Atom feeds
- Tracks which items have been read
- Aggregates multiple feeds
- Triggers on new items (polling-based via Heartbeat daemon)
- Exposes API/CLI interface only (no browser/TUI)
- Runs as a self-contained Docker container

---

## 2. Existing Solutions

### 2.1 Node.js RSS Parsing Libraries

#### rss-parser (npm)
- **Repo**: github.com/rbren/rss-parser
- **Stars**: ~1,400+ | **Version**: 3.13.0
- **Install**: `npm install --save rss-parser`

**Pros**:
- Lightweight, pure JavaScript
- Full TypeScript definitions included
- Auto-detects RSS 1.0, RSS 2.0, and Atom formats
- Works in both Node.js and browser
- Normalizes all feed types to consistent JavaScript objects
- Custom field mapping support
- Actively maintained

**Cons**:
- Parsing only - no state management
- No read tracking
- No database/persistence layer
- Need to build feed management on top

**Usage**:
```typescript
import Parser from 'rss-parser';
const parser = new Parser();
const feed = await parser.parseURL('https://example.com/feed.xml');
console.log(feed.title);
feed.items.forEach(item => console.log(item.title, item.link));
```

#### feedparser (npm)
- Lower-level streaming parser
- More complex API, less common usage
- Less TypeScript support

**Verdict**: `rss-parser` is the standard choice for Node.js RSS parsing.

---

### 2.2 Self-Hosted RSS Aggregators with APIs

#### Miniflux (Recommended)
- **Repo**: github.com/miniflux/v2
- **Stars**: 8,687 | **License**: Apache-2.0
- **Language**: Go (single binary)
- **Database**: PostgreSQL only

**Pros**:
- **Comprehensive REST API** - covers all operations
- Extremely lightweight (~20MB RAM)
- Built for headless/API-first usage
- Official Go and Python clients
- Entry status tracking (read/unread/removed)
- Categories and feed management
- Health check endpoints (`/healthcheck`, `/readiness`)
- OPML import/export
- Token-based authentication (`X-Auth-Token` header)
- Designed for containerization
- Actively maintained (updated Jan 2026)

**API Highlights**:
```
GET  /v1/entries?status=unread    # Get unread entries
PUT  /v1/entries                   # Update entry status (mark read)
POST /v1/feeds                     # Add new feed
PUT  /v1/feeds/refresh             # Trigger feed refresh
GET  /v1/feeds/counters            # Get read/unread counts
```

**Cons**:
- Requires PostgreSQL (we already plan Postgres for ClawDock)
- No native Node.js client (would need to build or use fetch)
- Written in Go (not our stack, but containerized so irrelevant)

**Docker Compose**:
```yaml
services:
  miniflux:
    image: miniflux/miniflux:latest
    environment:
      - DATABASE_URL=postgres://user:pass@db/miniflux?sslmode=disable
      - RUN_MIGRATIONS=1
      - CREATE_ADMIN=1
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=${MINIFLUX_PASSWORD}
    depends_on:
      - db
```

#### FreshRSS
- **Repo**: github.com/FreshRSS/FreshRSS
- **Stars**: 10,000+ | **License**: AGPL-3.0
- **Language**: PHP
- **Database**: SQLite, MySQL, or PostgreSQL

**Pros**:
- Feature-rich with plugin ecosystem
- Google Reader-compatible API
- Multi-user support
- Custom CSS selectors for scraping

**Cons**:
- Heavier resource usage (PHP)
- Google Reader API is legacy/complex
- More UI-focused than API-focused
- Requires separate API password configuration
- CLI commands via `docker exec` for management

**API Access**:
```python
# FreshRSS uses Google Reader API at /api/greader.php
# Requires OAuth-like token flow
GET /api/greader.php/accounts/ClientLogin
GET /api/greader.php/subscription/list?output=json
```

#### Other Notable Options

| Solution | Language | Database | Notes |
|----------|----------|----------|-------|
| **Yarr** | Go | SQLite | Single binary, minimal API |
| **Fusion** | Go | SQLite | ~80MB RAM, lightweight |
| **CommaFeed** | Java | - | Google Reader inspired |
| **Feedpushr** | Go | - | Transform/output focused |
| **TinyFeed** | Go | - | Static HTML generator |

---

### 2.3 Lightweight Alternatives

#### Build Minimal Layer on rss-parser
- Use `rss-parser` for parsing
- Add SQLite/Postgres table for state
- Simple service with Hono API

**Estimated Effort**: 1-2 days for basic implementation

#### Miniflux as Sidecar
- Deploy Miniflux container
- Build thin TypeScript wrapper for Miniflux API
- Let Miniflux handle all RSS complexity

**Estimated Effort**: Few hours for wrapper, zero for RSS logic

---

## 3. Recommendation

### Decision: **FIND** - Use Miniflux

**Rationale**:

1. **API-First Design**: Miniflux was built for programmatic access. Its REST API covers 100% of what we need with clean, modern endpoints.

2. **ClawDock Stack Compatibility**:
   - We already plan PostgreSQL for the Memory Store
   - Miniflux can share our Postgres instance
   - Docker-native, follows one-container-per-bay philosophy

3. **Read Tracking Solved**: Entry status (read/unread) is a first-class feature with timestamp tracking.

4. **Polling Support**: `PUT /v1/feeds/refresh` can be triggered by our Heartbeat daemon.

5. **Lightweight**: ~20MB RAM means negligible overhead.

6. **The Vision Principle**: "RSS is well-solved" - confirmed. Miniflux is mature, stable, and purpose-built.

### Why Not Build?

Building our own would mean:
- Reimplementing feed refresh scheduling
- HTTP caching (ETags, Last-Modified)
- Entry deduplication
- Error handling for malformed feeds
- OPML import/export

This is wasted effort when Miniflux solves it all.

### Why Not FreshRSS?

- Heavier (PHP vs Go single binary)
- More UI-focused, less API-focused
- Legacy Google Reader API vs modern REST
- More complex authentication flow

---

## 4. Implementation Notes

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ClawDock Castle                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Gateway    │  │  Heartbeat   │  │   RSS Bay       │   │
│  │              │  │   Daemon     │  │  (Miniflux)     │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │            │
│         │    trigger      │   poll interval    │            │
│         │    refresh      ├───────────────────►│            │
│         │                 │                    │            │
│         │                 │   check for new    │            │
│         │                 │◄───────────────────┤            │
│         │                 │                    │            │
│         │   queue work    │                    │            │
│         │◄────────────────┤                    │            │
│         │                 │                    │            │
│  ┌──────┴───────┐                    ┌────────┴────────┐   │
│  │  OpenCode    │                    │    Postgres     │   │
│  │   Server     │                    │   (shared)      │   │
│  └──────────────┘                    └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Bay Interface Implementation

```typescript
// RSS Bay wrapper implementing ClawDock Bay interface
interface RSSBay {
  // Check for new items (called by Heartbeat)
  check(): Promise<{ hasNew: boolean; count: number }>;
  
  // Fetch unread items for processing
  fetch(limit?: number): Promise<RSSItem[]>;
  
  // Mark items as read after processing
  markRead(entryIds: number[]): Promise<void>;
  
  // Configure feeds
  addFeed(url: string, categoryId?: number): Promise<number>;
  removeFeed(feedId: number): Promise<void>;
  
  // Not applicable for RSS (inbound only)
  send(): never;
}
```

### 4.3 Miniflux TypeScript Client

We'll need a thin wrapper since there's no official Node.js client:

```typescript
// packages/rss-bay/src/miniflux-client.ts
export class MinifluxClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      ...options,
      headers: {
        'X-Auth-Token': this.apiKey,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(`Miniflux API error: ${res.status}`);
    return res.json();
  }

  async getUnreadEntries(limit = 50) {
    return this.request<{ entries: Entry[]; total: number }>(
      `/entries?status=unread&limit=${limit}`
    );
  }

  async markEntriesRead(entryIds: number[]) {
    return this.request('/entries', {
      method: 'PUT',
      body: JSON.stringify({ entry_ids: entryIds, status: 'read' }),
    });
  }

  async refreshAllFeeds() {
    return this.request('/feeds/refresh', { method: 'PUT' });
  }

  async getCounters() {
    return this.request<{ reads: Record<string, number>; unreads: Record<string, number> }>(
      '/feeds/counters'
    );
  }
}
```

### 4.4 Docker Compose Addition

```yaml
# In data/{AgentName}/docker-compose.yml
services:
  rss-bay:
    image: miniflux/miniflux:latest
    container_name: clawdock-rss-bay
    environment:
      - DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/miniflux?sslmode=disable
      - RUN_MIGRATIONS=1
      - CREATE_ADMIN=1
      - ADMIN_USERNAME=clawdock
      - ADMIN_PASSWORD=${RSS_BAY_PASSWORD}
      - BASE_URL=https://rss.${DOMAIN}
      - POLLING_FREQUENCY=0  # Disable auto-polling; Heartbeat controls this
    depends_on:
      - postgres
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rss.rule=Host(`rss.${DOMAIN}`)"
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 4.5 Heartbeat Integration

```yaml
# In config/heartbeat.yml
rss:
  check_interval: 15m
  triggers:
    - condition: "any_new"
      action: batch
      batch_size: 10
  prompt_template: heartbeat/rss-digest.md
```

Heartbeat flow:
1. Every 15 minutes, call `PUT /v1/feeds/refresh` on Miniflux
2. Call `GET /v1/entries?status=unread` to check for new items
3. If items exist, queue work for OpenCode with prompt template
4. After Agent processes, mark entries as read

---

## 5. Open Questions

1. **Shared vs Dedicated Database**
   - Should Miniflux share the main Postgres instance or have its own?
   - Recommendation: Share for simplicity; Miniflux creates its own tables with prefix

2. **Feed Configuration UI**
   - Do we expose Miniflux's built-in web UI, or build feed management into Gateway?
   - Recommendation: Start with Miniflux UI accessible via Traefik; later add Gateway integration

3. **Entry Processing Strategy**
   - Batch all unread entries into one prompt, or process individually?
   - Depends on use case (digest vs immediate action)
   - Configurable via prompt templates

4. **Polling Frequency**
   - Miniflux has built-in polling; should we disable it entirely?
   - Recommendation: Disable auto-polling (`POLLING_FREQUENCY=0`) and let Heartbeat control timing

5. **TypeScript Client Publishing**
   - Should we publish the Miniflux TypeScript client as a standalone package?
   - Probably not initially; keep internal until proven stable

---

## 6. Summary

| Aspect | Decision |
|--------|----------|
| **Approach** | FIND (use existing) |
| **Solution** | Miniflux |
| **Effort** | Low (deploy container + thin wrapper) |
| **Risk** | Minimal (mature, well-maintained) |
| **Stack Fit** | Excellent (Postgres, Docker, REST API) |

The VISION.md statement that "RSS is well-solved" is **confirmed**. Miniflux is exactly what we need - a minimalist, API-first, container-ready RSS aggregator that handles all the hard problems (parsing, caching, deduplication, state tracking) so we can focus on what's unique to ClawDock: the Agent's intelligent processing of feed items.
