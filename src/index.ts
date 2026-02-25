import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { upload } from "./routes/upload";
import { retrieval } from "./routes/retrieval";
import type { AppEnv } from "./types";

// Re-export the Durable Object class so the runtime can find it
import { ImageUploaderMCP } from "./mcp-agent";
export { ImageUploaderMCP };

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", cors());
app.get("/health", (c) => c.json({ status: "ok" }));

// Mount HTTP routes
app.route("/upload", upload);
app.route("/", retrieval);

// MCP endpoints
app.mount('/sse', ImageUploaderMCP.serveSSE('/sse').fetch, { replaceRequest: false })
app.mount('/mcp', ImageUploaderMCP.serve('/mcp').fetch, { replaceRequest: false })

// Not-found handler
app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ success: false, error: "Internal server error" }, 500);
});

export default app;
