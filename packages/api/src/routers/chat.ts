/**
 * Chat Router - tRPC router for chat operations
 * Handles sessions and messages (streaming is handled via Hono /api/chat route)
 */

import { z } from "zod";
import { publicProcedure, router } from "../index";
import { TRPCError } from "@trpc/server";
import { db, chatSessions, chatMessages } from "@ClawDock/db";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { ChatSession, ChatMessage } from "@ClawDock/db";

// ============================================================================
// Schemas
// ============================================================================

const SessionIdSchema = z.object({
  id: z.string().uuid(),
});

const CreateSessionSchema = z.object({
  title: z.string().optional(),
});

const ListMessagesSchema = z.object({
  sessionId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
});

// ============================================================================
// Types
// ============================================================================

export type SessionWithMessageCount = ChatSession & {
  messageCount: number;
};

// ============================================================================
// Router
// ============================================================================

export const chatRouter = router({
  /**
   * List all chat sessions with message counts
   */
  listSessions: publicProcedure.query(async (): Promise<SessionWithMessageCount[]> => {
    const sessionsWithCount = await db
      .select({
        id: chatSessions.id,
        title: chatSessions.title,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
        metadata: chatSessions.metadata,
        messageCount: sql<number>`count(${chatMessages.id})::int`,
      })
      .from(chatSessions)
      .leftJoin(chatMessages, eq(chatSessions.id, chatMessages.sessionId))
      .groupBy(chatSessions.id)
      .orderBy(desc(chatSessions.updatedAt));

    return sessionsWithCount;
  }),

  /**
   * Get a single session by ID
   */
  getSession: publicProcedure
    .input(SessionIdSchema)
    .query(async ({ input }): Promise<ChatSession | null> => {
      const session = await db.query.chatSessions.findFirst({
        where: eq(chatSessions.id, input.id),
      });
      return session ?? null;
    }),

  /**
   * Create a new chat session
   */
  createSession: publicProcedure
    .input(CreateSessionSchema)
    .mutation(async ({ input }): Promise<ChatSession> => {
      const [session] = await db
        .insert(chatSessions)
        .values({
          title: input.title ?? "New Chat",
        })
        .returning();

      if (!session) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create session",
        });
      }

      return session;
    }),

  /**
   * Delete a chat session (and all its messages)
   */
  deleteSession: publicProcedure
    .input(SessionIdSchema)
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      await db.delete(chatSessions).where(eq(chatSessions.id, input.id));
      return { success: true };
    }),

  /**
   * List messages for a session
   */
  listMessages: publicProcedure
    .input(ListMessagesSchema)
    .query(async ({ input }): Promise<ChatMessage[]> => {
      const messages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.sessionId, input.sessionId),
        orderBy: [desc(chatMessages.createdAt)],
        limit: input.limit,
      });

      // Return in chronological order (oldest first)
      return messages.reverse();
    }),

  /**
   * Get a single message by ID
   */
  getMessage: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }): Promise<ChatMessage | null> => {
      const message = await db.query.chatMessages.findFirst({
        where: eq(chatMessages.id, input.id),
      });
      return message ?? null;
    }),
});

export type ChatRouter = typeof chatRouter;
