import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Bearer-token auth middleware. Compares Authorization header against UPLOAD_API_KEY secret.
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice("Bearer ".length);
  if (token !== c.env.UPLOAD_API_KEY) {
    return c.json({ success: false, error: "Invalid API key" }, 401);
  }

  await next();
});
