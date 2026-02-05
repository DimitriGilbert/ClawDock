import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export { TRPCError };

export { getDockerClient } from "./lib/docker/client";
export { readAgentFile } from "./lib/agent/files";

// Snapshot system types
export type {
  Snapshot,
  SnapshotSettings,
  DiffResult,
  SnapshotError,
  CreateSnapshotOptions,
  RestoreOptions,
} from "./lib/snapshot/types";
