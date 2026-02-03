/**
 * Stack Router - tRPC router for Docker stack operations
 * Provides container management and compose file operations with real-time subscriptions
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { publicProcedure, router } from "../index";
import {
  listContainers,
  getContainer,
  startContainer,
  stopContainer,
  restartContainer,
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
import type {
  ContainerEvent,
  HealthEvent,
  ContainerInfo,
  ContainerDetails,
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

const UpdateComposeSchema = z.object({
  content: z.string().min(1, "Content is required"),
  comment: z.string().optional(),
});

const ValidateComposeSchema = z.object({
  content: z.string().min(1, "Content is required"),
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
  const envPath = process.env["COMPOSE_FILE_PATH"];
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
// Router Type
// ============================================================================

/**
 * Type alias for the stack router to avoid circular type inference issues
 */
export type StackRouterType = ReturnType<typeof router>;

// ============================================================================
// Router
// ============================================================================

export const stackRouter: StackRouterType = router({
  // ============================================================================
  // Container Queries
  // ============================================================================

  /**
   * Lists all containers (running and stopped)
   */
  listContainers: publicProcedure.query(async (): Promise<ContainerInfo[]> => {
    try {
      const containers = await listContainers({ all: true });
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

  // ============================================================================
  // Container Mutations
  // ============================================================================

  /**
   * Starts a stopped container
   */
  startContainer: publicProcedure
    .input(ContainerIdSchema.merge(TimeoutSchema.partial()))
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
    .input(
      z.object({
        id: z.string().min(1, "Container ID is required"),
        timeout: z.number().int().min(1).max(300).optional(),
      }),
    )
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
    .input(
      z.object({
        id: z.string().min(1, "Container ID is required"),
        timeout: z.number().int().min(1).max(300).optional(),
      }),
    )
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
    .input(z.object({ content: z.string() }))
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
    .input(
      z.object({
        data: z.record(z.string(), z.unknown()),
        options: z
          .object({
            indent: z.number().optional(),
            lineWidth: z.number().optional(),
          })
          .optional(),
      }),
    )
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
    .subscription(({ input }) => {
      return observable<ContainerEvent>((emit) => {
        const unsubscribe = subscribeToContainerEvents(
          (event) => {
            emit.next(event);
          },
          {
            containerId: input.containerId,
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

        return () => {
          unsubscribe();
        };
      });
    }),

  /**
   * Subscribes to container health status changes
   * Uses SSE (httpSubscriptionLink pattern) for real-time updates
   */
  onHealthChange: publicProcedure
    .input(SubscribeOptionsSchema)
    .subscription(({ input }) => {
      return observable<HealthEvent>((emit) => {
        const unsubscribe = subscribeToHealthEvents(
          (event) => {
            emit.next(event);
          },
          {
            containerId: input.containerId,
          },
        );

        return () => {
          unsubscribe();
        };
      });
    }),
});

// ============================================================================
// Export Router Type
// ============================================================================

export type StackRouter = typeof stackRouter;
