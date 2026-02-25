import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { agentsMiddleware } from "hono-agents";
import { upload } from "./routes/upload";
import { retrieval } from "./routes/retrieval";
import type { AppEnv } from "./types";

// Re-export the Durable Object class so the runtime can find it
export { ImageUploaderMCP } from "./mcp-agent";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", cors());
app.use("*", agentsMiddleware());

app.get("/health", (c) => c.json({ status: "ok" }));

// Mount HTTP routes
app.route("/upload", upload);
app.route("/", retrieval);

// Not-found handler
app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ success: false, error: "Internal server error" }, 500);
});

export default app;
