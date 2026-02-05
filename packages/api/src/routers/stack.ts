/**
 * Stack Router - tRPC router for Docker stack operations
 * Provides container management and compose file operations with real-time subscriptions
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "@ClawDock/env/server";
import { publicProcedure, router } from "../index";
import {
  listContainers,
  getContainer,
  getContainerStats,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  applyStackChanges,
  subscribeToContainerEvents,
  subscribeToHealthEvents,
} from "../lib/docker/stack";
import {
  readComposeFile,
  writeComposeFile,
  parseCompose,
  stringifyCompose,
  validateComposeContent,
  findComposeFile,
} from "../lib/docker/editor";
import { createSnapshot, getSettings } from "../lib/snapshot/service";
import type {
  ContainerEvent,
  HealthEvent,
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  ValidationResult,
} from "../lib/docker/types";

// ============================================================================
// Schemas
// ============================================================================

const ContainerIdSchema = z.object({
  id: z.string().min(1, "Container ID is required"),
});

const TimeoutSchema = z.object({
  timeout: z.number().int().min(1).max(300).optional(),
});

const StopContainerInputSchema = z.object({
  id: z.string().min(1, "Container ID is required"),
  timeout: z.number().int().min(1).max(300).optional(),
});

const RestartContainerInputSchema = z.object({
  id: z.string().min(1, "Container ID is required"),
  timeout: z.number().int().min(1).max(300).optional(),
});

const RemoveContainerInputSchema = z.object({
  id: z.string(),
});

const UpdateComposeSchema = z.object({
  content: z.string().min(1, "Content is required"),
  comment: z.string().optional(),
});

const ValidateComposeSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

const ParseComposeInputSchema = z.object({
  content: z.string(),
});

const StringifyComposeInputSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  options: z
    .object({
      indent: z.number().optional(),
      lineWidth: z.number().optional(),
    })
    .optional(),
});

const SubscribeOptionsSchema = z.object({
  containerId: z.string().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the compose file path from environment or finds it
 */
async function getComposeFilePath(): Promise<string | null> {
  const envPath = env.COMPOSE_FILE_PATH;
  if (envPath) {
    return envPath;
  }

  const cwd = process.cwd();
  return findComposeFile(cwd);
}

/**
 * Formats container info for API response
 */
function formatContainerInfo(container: ContainerInfo): ContainerInfo {
  return container;
}

/**
 * Formats container details for API response
 */
function formatContainerDetails(details: ContainerDetails): ContainerDetails {
  return details;
}

// ============================================================================
// Router
// ============================================================================

export const stackRouter = router({
  // ============================================================================
  // Container Queries
  // ============================================================================

  /**
   * Lists all containers (running and stopped)
   */
  listContainers: publicProcedure
    .input(
      z.object({
        showAll: z.boolean().optional().default(false),
      }).optional(),
    )
    .query(async ({ input }): Promise<ContainerInfo[]> => {
      const showAll = input?.showAll ?? false;
      try {
        const containers = await listContainers({ all: true, showAll });
        return containers.map(formatContainerInfo);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list containers: ${message}`,
        });
      }
    }),

  /**
   * Gets detailed information about a specific container
   */
  getContainer: publicProcedure
    .input(ContainerIdSchema)
    .query(async ({ input }): Promise<ContainerDetails> => {
      try {
        const details = await getContainer(input.id);
        return formatContainerDetails(details);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("No such container")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Container not found: ${input.id}`,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get container: ${message}`,
        });
      }
    }),

  /**
   * Gets real-time statistics for a specific container
   */
  getContainerStats: publicProcedure
    .input(ContainerIdSchema)
    .query(async ({ input }): Promise<ContainerStats> => {
      try {
        return await getContainerStats(input.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("No such container")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Container not found: ${input.id}`,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get container stats: ${message}`,
        });
      }
    }),

  // ============================================================================
  // Container Mutations
  // ============================================================================

  /**
   * Starts a stopped container
   */
  startContainer: publicProcedure
    .input(ContainerIdSchema.and(TimeoutSchema))
    .mutation(
      async ({
        input,
      }): Promise<{ success: boolean; error?: string; containerId: string }> => {
        const result = await startContainer(input.id);

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to start container: ${result.error}`,
          });
        }

        return { success: true, containerId: input.id };
      },
    ),

  /**
   * Stops a running container
   */
  stopContainer: publicProcedure
    .input(StopContainerInputSchema)
    .mutation(
      async ({
        input,
      }): Promise<{ success: boolean; error?: string; containerId: string }> => {
        const result = await stopContainer(input.id, input.timeout);

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to stop container: ${result.error}`,
          });
        }

        return { success: true, containerId: input.id };
      },
    ),

  /**
   * Restarts a container
   */
  restartContainer: publicProcedure
    .input(RestartContainerInputSchema)
    .mutation(
      async ({
        input,
      }): Promise<{ success: boolean; error?: string; containerId: string }> => {
        const result = await restartContainer(input.id, input.timeout);

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to restart container: ${result.error}`,
          });
        }

        return { success: true, containerId: input.id };
      },
    ),

  /**
   * Removes a container
   */
  removeContainer: publicProcedure
    .input(RemoveContainerInputSchema)
    .mutation(async ({ input }) => {
      const result = await removeContainer(input.id);
      if (!result.success) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: result.error,
        });
      }
      return { success: true };
    }),

  // ============================================================================
  // Compose File Operations
  // ============================================================================

  /**
   * Gets the current compose file content
   */
  getCompose: publicProcedure.query(
    async (): Promise<{ content: string; path: string | null }> => {
      try {
        const filePath = await getComposeFilePath();

        if (!filePath) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No compose file found in current directory",
          });
        }

        const content = await readComposeFile(filePath);
        return { content, path: filePath };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to read compose file: ${message}`,
        });
      }
    },
  ),

  /**
   * Updates the compose file content
   */
  updateCompose: publicProcedure
    .input(UpdateComposeSchema)
    .mutation(
      async ({
        input,
      }): Promise<{
        success: boolean;
        path: string | null;
        comment?: string;
      }> => {
        try {
          const filePath = await getComposeFilePath();

          if (!filePath) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No compose file found to update",
            });
          }

          // Validate before writing
          const validation = validateComposeContent(input.content);
          if (!validation.valid) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Validation failed: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(", ")}`,
            });
          }

          // Check if pre-change snapshots are enabled and create snapshot before updating
          const settings = await getSettings();
          if (settings.preChangeCompose) {
            await createSnapshot({
              type: 'pre-change',
              trigger: 'compose-update',
              comment: input.comment || 'Before compose update',
              includeDatabase: true,
            });
          }

          await writeComposeFile(filePath, input.content);

          return {
            success: true,
            path: filePath,
            comment: input.comment,
          };
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }

          const message = error instanceof Error ? error.message : String(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to update compose file: ${message}`,
          });
        }
      },
    ),

  /**
   * Applies the changes from the compose file to the running stack
   */
  applyChanges: publicProcedure.mutation(
    async (): Promise<{ success: boolean; output?: string }> => {
      try {
        const filePath = await getComposeFilePath();

        if (!filePath) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No compose file found to apply",
          });
        }

        const result = await applyStackChanges(filePath);

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to apply stack changes: ${result.error}`,
          });
        }

        return { success: true, output: result.output };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to apply stack: ${message}`,
        });
      }
    },
  ),

  /**
   * Validates compose file content without saving
   */
  validateCompose: publicProcedure
    .input(ValidateComposeSchema)
    .mutation(async ({ input }): Promise<ValidationResult> => {
      return validateComposeContent(input.content);
    }),

  /**
   * Parses compose content to structured object
   */
  parseCompose: publicProcedure
    .input(ParseComposeInputSchema)
    .query(async ({ input }) => {
      try {
        const parsed = parseCompose(input.content);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to parse compose file: ${message}`,
        });
      }
    }),

  /**
   * Stringifies compose object to YAML
   */
  stringifyCompose: publicProcedure
    .input(StringifyComposeInputSchema)
    .query(async ({ input }) => {
      try {
        const yaml = stringifyCompose(
          input.data as { services?: Record<string, { image?: string }> },
          input.options,
        );
        return { success: true, content: yaml };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to stringify compose: ${message}`,
        });
      }
    }),

  // ============================================================================
  // Subscriptions (Real-time Updates)
  // ============================================================================

  /**
   * Subscribes to container events (start, stop, create, destroy, etc.)
   * Uses SSE (httpSubscriptionLink pattern) for real-time updates
   */
  onContainerChange: publicProcedure
    .input(SubscribeOptionsSchema)
    .subscription(async function* (opts) {
      const controller = new AbortController();
      const signal = controller.signal;
      
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => controller.abort());
      }

      const queue: ContainerEvent[] = [];
      const unsubscribe = subscribeToContainerEvents(
        (event) => {
          queue.push(event);
        },
        {
          containerId: opts.input.containerId,
          eventTypes: [
            "start",
            "stop",
            "die",
            "create",
            "destroy",
            "pause",
            "unpause",
            "restart",
          ],
        },
      );

      try {
        while (!signal.aborted) {
          if (queue.length > 0) {
            const event = queue.shift();
            if (event) {
              yield event;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } finally {
        unsubscribe();
      }
    }),

  /**
   * Subscribes to container health status changes
   * Uses SSE (httpSubscriptionLink pattern) for real-time updates
   */
  onHealthChange: publicProcedure
    .input(SubscribeOptionsSchema)
    .subscription(async function* (opts) {
      const controller = new AbortController();
      const signal = controller.signal;
      
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => controller.abort());
      }

      const queue: HealthEvent[] = [];
      const unsubscribe = subscribeToHealthEvents(
        (event) => {
          queue.push(event);
        },
        {
          containerId: opts.input.containerId,
        },
      );

      try {
        while (!signal.aborted) {
          if (queue.length > 0) {
            const event = queue.shift();
            if (event) {
              yield event;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } finally {
        unsubscribe();
      }
    }),
});

export type StackRouter = typeof stackRouter;
