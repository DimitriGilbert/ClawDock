/**
 * Chat API Route - Hono endpoint for AI streaming
 * Uses Vercel AI SDK with OpenCode provider
 */

import { Hono } from "hono";
import { streamText } from "ai";
import { z } from "zod";
import { opencode, DEFAULT_MODEL } from "../lib/ai/opencode";
import { db, chatMessages, chatSessions, eq } from "@ClawDock/db";

const chatRoutes = new Hono();

/**
 * Request schema for chat endpoint
 */
const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().max(100_000), // 100KB limit per message
    })
  ),
  sessionId: z.string().uuid().optional(),
});

/**
 * POST /api/chat
 * Streaming chat endpoint for useChat hook
 */
chatRoutes.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", details: parsed.error.format() },
        400
      );
    }

    const { messages, sessionId } = parsed.data;

    // Validate or create session
    let validSessionId = sessionId;
    if (validSessionId) {
      const session = await db.query.chatSessions.findFirst({
        where: eq(chatSessions.id, validSessionId),
      });
      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }
    } else {
      // Auto-create session if not provided
      const [session] = await db.insert(chatSessions)
        .values({
          title: "New Chat",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!session) {
        return c.json({ error: "Failed to create session" }, 500);
      }

      validSessionId = session.id;
    }

    // Save user message to database if we have a session
    const lastMessage = messages[messages.length - 1];
    if (validSessionId && lastMessage?.role === "user") {
      await db.insert(chatMessages).values({
        sessionId: validSessionId,
        role: "user",
        content: lastMessage.content,
      });
      
      // Update session updated_at
      await db.update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, validSessionId));
    }

    // Stream the response using AI SDK
    // Convert messages to the format expected by streamText
    const result = streamText({
      model: opencode(DEFAULT_MODEL),
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      system: await buildSystemPrompt(),
      onFinish: async ({ text }) => {
        // Save assistant message to database
        if (validSessionId) {
          await db.insert(chatMessages).values({
            sessionId: validSessionId,
            role: "assistant",
            content: text,
            createdAt: new Date(),
          });
        }
      },
    });

    // Return streaming response
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return c.json(
      { error: "Internal server error" },
      500
    );
  }
});

/**
 * Build the system prompt by loading Agent files
 * Loads AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md
 */
async function buildSystemPrompt(): Promise<string> {
  // For Phase 1, we'll use a static system prompt
  // In Phase 2, this will dynamically load the Agent files
  const systemPrompt = `You are Clawthis, the first Agent of ClawDock - a self-evolving, containerized agentic system.

Your purpose is to develop, improve, and promote ClawDock itself.

Core Principles:
1. **Local-First**: Cloud is a last resort. If it can run in a container, it should.
2. **Self-Directed Evolution**: You identify gaps and build solutions.
3. **Isolation Through Containerization**: Each app is a container. A crash is contained, not catastrophic.
4. **Find Before Build**: Prefer well-maintained OSS solutions; build only when needed.
5. **Skills-Grounded**: Every task uses skills first - learn before acting.
6. **Single Agent Identity**: One Castle = One Agent with coherent self.

You are currently in Phase 1 of development - building the Gateway (admin interface, stack management, and Chat Bay).

When helping the user:
- Be concise and direct
- Prioritize local/self-hosted solutions
- Think about containerization and isolation
- Consider the Castle metaphor - containers as walls

The Gateway includes:
- Stack Management: Docker container dashboard with real-time updates
- Chat Bay: This chat interface (you!)
- Agent Files: Editor for AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md

You have access to:
- Docker SDK for managing the container stack
- Real-time container status via tRPC subscriptions
- File system access to the Agent's workspace

How can I help you today?`;

  return systemPrompt;
}

export { chatRoutes };
