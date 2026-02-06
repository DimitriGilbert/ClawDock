import { publicProcedure, router } from "../index";
import { agentRouter } from "./agent";
import { chatRouter } from "./chat";
import { memoryRouter } from "./memory";
import { snapshotRouter } from "./snapshot";
import { stackRouter } from "./stack";
import { taskRouter } from "./task";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  agent: agentRouter,
  chat: chatRouter,
  memory: memoryRouter,
  snapshot: snapshotRouter,
  stack: stackRouter,
  task: taskRouter,
});
export type AppRouter = typeof appRouter;
