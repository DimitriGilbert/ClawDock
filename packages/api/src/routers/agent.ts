/**
 * Agent Files tRPC Router
 * Provides procedures for managing agent files (AGENTS.md, SOUL.md, GOALS.md, REFLECTION.md)
 */

import { z } from 'zod';
import { publicProcedure, router, TRPCError } from '../index';
import {
  readAgentFile,
  updateAgentFile,
  listAgentFiles,
  getFileHistory,
  revertAgentFile,
} from '../lib/agent/files';
import {
  AgentFileError,
  AGENT_FILE_NAMES,
  type AgentFileName,
} from '../lib/agent/types';

/**
 * Zod schema for validating agent filenames
 */
const AgentFileNameSchema: z.ZodType<AgentFileName> = z.enum(
  AGENT_FILE_NAMES as [AgentFileName, ...AgentFileName[]],
);

/**
 * Zod schema for file content
 */
const FileContentSchema = z.string();

/**
 * Zod schema for commit hash
 */
const CommitHashSchema = z.string().min(7).max(40);

/**
 * Zod schema for history limit
 */
const HistoryLimitSchema = z.number().int().min(1).max(100).default(50);

/**
 * tRPC router for agent file operations
 */
export const agentRouter = router({
  /**
   * Get file content
   * Query: { filename: string } → { content: string; editable: boolean }
   */
  getFile: publicProcedure
    .input(
      z.object({
        filename: AgentFileNameSchema,
      }),
    )
    .query(async ({ input }) => {
      try {
        const result = await readAgentFile(input.filename);
        return result;
      } catch (error) {
        if (error instanceof AgentFileError) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),

  /**
   * Update (save) a file
   * Mutation: { filename: string; content: string } → { success: boolean }
   * Note: REFLECTION.md requires explicit unlock to edit
   */
  updateFile: publicProcedure
    .input(
      z.object({
        filename: AgentFileNameSchema,
        content: FileContentSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await updateAgentFile(input.filename, input.content);
        return result;
      } catch (error) {
        if (error instanceof AgentFileError) {
          if (error.code === 'FILE_NOT_EDITABLE') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: error.message,
            });
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),

  /**
   * List all agent files with metadata
   * Query: () → { files: Array<{ name: string; editable: boolean; lastModified: Date; size: number }> }
   */
  listFiles: publicProcedure.query(async () => {
    try {
      const result = await listAgentFiles();
      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }),

  /**
   * Get file version history
   * Query: { filename: string; limit?: number } → { commits: Array<{ hash: string; message: string; date: Date; author: string }> }
   */
  getFileHistory: publicProcedure
    .input(
      z.object({
        filename: AgentFileNameSchema,
        limit: HistoryLimitSchema,
      }),
    )
    .query(async ({ input }) => {
      try {
        const result = await getFileHistory(input.filename, input.limit);
        return result;
      } catch (error) {
        if (error instanceof AgentFileError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),

  /**
   * Revert file to a specific commit
   * Mutation: { filename: string; commitHash: string } → { success: boolean }
   */
  revertFile: publicProcedure
    .input(
      z.object({
        filename: AgentFileNameSchema,
        commitHash: CommitHashSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await revertAgentFile(input.filename, input.commitHash);
        return result;
      } catch (error) {
        if (error instanceof AgentFileError) {
          if (error.code === 'FILE_NOT_EDITABLE') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: error.message,
            });
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),
});

/**
 * Type export for the agent router
 */
export type AgentRouter = typeof agentRouter;
