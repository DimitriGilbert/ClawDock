import { createContext } from "@ClawDock/api/context";
import { appRouter } from "@ClawDock/api/routers/index";
import { env } from "@ClawDock/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { chatRoutes } from "./routes/chat";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

// Mount chat Hono routes
app.route("/api", chatRoutes);

app.get("/", (c) => {
  return c.text("OK");
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
