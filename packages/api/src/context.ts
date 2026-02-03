import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context: _context }: CreateContextOptions) {
  // No auth configured - context param unused but kept for API consistency
  return {
    session: null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
