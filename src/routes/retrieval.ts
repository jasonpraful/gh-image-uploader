import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { buildImageUrl } from "../utils/storage";
import type { AppEnv, ErrorResponse, UrlResponse, ListResponse, ImageMetadata } from "../types";

const retrieval = new Hono<AppEnv>();

/**
 * GET /images/* — Serve an image if the branch query param matches the stored metadata.
 * No auth required; the branch acts as an access token.
 */
retrieval.get("/images/*", async (c) => {
  const key = c.req.path.replace("/images/", "");
  const branch = c.req.query("branch");

  if (!branch) {
    return c.json<ErrorResponse>({ success: false, error: "Missing 'branch' query parameter" }, 403);
  }

  const object = await c.env.IMAGE_BUCKET.get(key);
  if (!object) {
    return c.json<ErrorResponse>({ success: false, error: "Image not found" }, 404);
  }

  if (object.customMetadata?.branch !== branch) {
    return c.json<ErrorResponse>({ success: false, error: "Access denied: incorrect branch" }, 403);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

/**
 * GET /url/* — Return the serving URL for a stored image (auth required).
 */
retrieval.get("/url/*", authMiddleware, async (c) => {
  const key = c.req.path.replace("/url/", "");

  const object = await c.env.IMAGE_BUCKET.head(key);
  if (!object) {
    return c.json<ErrorResponse>({ success: false, error: "Image not found" }, 404);
  }

  const branch = object.customMetadata?.branch;
  if (!branch) {
    return c.json<ErrorResponse>({ success: false, error: "Image metadata missing branch" }, 500);
  }

  const url = buildImageUrl(new URL(c.req.url).origin, key, branch);
  return c.json<UrlResponse>({ success: true, key, url });
});

/**
 * GET /list/* — List all images for a branch (auth required).
 * The path after /list/ is treated as the branch prefix.
 */
retrieval.get("/list/*", authMiddleware, async (c) => {
  const branchRaw = c.req.path.replace("/list/", "");
  if (!branchRaw) {
    return c.json<ErrorResponse>({ success: false, error: "Missing branch in path" }, 400);
  }

  // Sanitize branch to match storage key prefix
  const prefix = branchRaw
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const listed = await c.env.IMAGE_BUCKET.list({ prefix: `${prefix}/` });
  const origin = new URL(c.req.url).origin;

  const images = listed.objects.map((obj) => ({
    key: obj.key,
    url: buildImageUrl(origin, obj.key, branchRaw),
    uploadedAt: obj.customMetadata?.uploadedAt ?? obj.uploaded.toISOString(),
  }));

  return c.json<ListResponse>({ success: true, branch: branchRaw, images });
});

export { retrieval };
