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
    allowHeaders: ["Content-Type", "Accept", "Authorization", "Last-Event-ID"],
    exposeHeaders: ["Content-Type"],
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

import { getDockerClient } from "@ClawDock/api";
import { streamSSE } from "hono/streaming";

// SSE log streaming endpoint
app.get("/api/logs/:containerId", async (c) => {
  const containerId = c.req.param("containerId");

  if (!containerId) {
    return c.json({ error: "Container ID is required" }, 400);
  }

  return streamSSE(c, async (stream) => {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);

    try {
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
      });

      // logStream is a NodeJS.ReadableStream (Buffer)
      logStream.on("data", (chunk) => {
        const line = chunk.toString("utf-8").trim();
        if (line) {
          void stream.writeSSE({
            event: "log",
            data: line,
          });
        }
      });

      logStream.on("error", (err) => {
        void stream.writeSSE({
          event: "error",
          data: err.message,
        });
      });

      logStream.on("end", () => {
        void stream.close();
      });

      // Keep stream open until client disconnects or logs end
      while (!c.req.raw.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Cleanup if needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (logStream as any).destroy === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (logStream as any).destroy();
      }
    } catch (error) {
      void stream.writeSSE({
        event: "error",
        data: error instanceof Error ? error.message : "Unknown error",
      });
      void stream.close();
    }
  });
});

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "fs/promises";
import { join } from "path";
import { initializeSnapshotSystem } from "@ClawDock/api/lib/snapshot/setup";
import { getHeartbeatDaemon } from "@ClawDock/api/lib/heartbeat/service";

// Serve static assets in production
if (env.NODE_ENV === "production") {
  // Serve built frontend assets
  app.use("/*", serveStatic({ root: "./dist/web" }));

  // Fallback to index.html for SPA routing
  app.get("*", async (c) => {
    try {
      const html = await readFile(join(process.cwd(), "dist/web/index.html"), "utf-8");
      return c.html(html);
    } catch {
      return c.text("Not Found", 404);
    }
  });
}

// Initialize snapshot system before starting the server
try {
  await initializeSnapshotSystem();
  console.log("Snapshot system initialized successfully");
} catch (error) {
  console.error("Failed to initialize snapshot system:", error);
  // Continue starting the server even if snapshot initialization fails
}

// Initialize heartbeat daemon in production mode
const heartbeatEnabled =
  env.NODE_ENV === "production" && env.HEARTBEAT_ENABLED !== "false";

if (heartbeatEnabled) {
  try {
    const heartbeat = getHeartbeatDaemon();
    await heartbeat.start();
    console.log("Heartbeat daemon started successfully");
  } catch (error) {
    console.error("Failed to start heartbeat daemon:", error);
    // Continue starting server even if heartbeat fails
  }
}

// Graceful shutdown handling
let server: ReturnType<typeof serve> | undefined = undefined;

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}, shutting down gracefully...`);

  if (heartbeatEnabled) {
    try {
      const heartbeat = getHeartbeatDaemon();
      await heartbeat.stop();
      console.log("Heartbeat daemon stopped");
    } catch (error) {
      console.error("Error stopping heartbeat:", error);
    }
  }

  if (server) {
    await server.close();
  }

  process.exit(0);
};

server = serve(
  {
    fetch: app.fetch,
    port: 3002,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
