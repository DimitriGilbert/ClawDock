import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    OPENCODE_URL: z.string().url().default("http://opencode:4096"),
    OPENCODE_PASSWORD: z.string().optional(),
    AGENTS_DIR: z.string().default("./agents"),
    COMPOSE_FILE_PATH: z.string().default("docker-compose.yml"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
