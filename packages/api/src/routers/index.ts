import { publicProcedure, router } from "../index";
import { agentRouter } from "./agent";
import { chatRouter } from "./chat";
import { stackRouter } from "./stack";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  agent: agentRouter,
  chat: chatRouter,
  stack: stackRouter,
});
export type AppRouter = typeof appRouter;
