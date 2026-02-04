import { publicProcedure, router } from "../index";
import { agentRouter } from "./agent";
import { chatRouter } from "./chat";
import { snapshotRouter } from "./snapshot";
import { stackRouter } from "./stack";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  agent: agentRouter,
  chat: chatRouter,
  snapshot: snapshotRouter,
  stack: stackRouter,
});
export type AppRouter = typeof appRouter;
