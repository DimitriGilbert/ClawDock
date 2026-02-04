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

// Error handling middleware
app.use("/*", async (c, next) => {
  try {
    await next();
  } catch (error) {
    console.error("Request error:", error);
    const status = error instanceof Error && "status" in error
      ? (error as { status: number }).status
      : 500;

    const message = error instanceof Error
      ? error.message
      : "Internal server error";

    return c.json({
      error: message,
      status: "error",
      timestamp: new Date().toISOString(),
    }, status as 400 | 401 | 403 | 404 | 500 | 502 | 503);
  }
});

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
app.route("/", chatRoutes);

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
    port: 3002,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
