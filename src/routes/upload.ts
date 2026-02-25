import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authMiddleware } from "../middleware/auth";
import { generateStorageKey, isAllowedContentType, buildImageUrl } from "../utils/storage";
import type { AppEnv, ImageMetadata, UploadResponse, ErrorResponse } from "../types";

const upload = new Hono<AppEnv>();

upload.post(
  "/",
  authMiddleware,
  bodyLimit({ maxSize: 100 * 1024 * 1024 }), // 100 MB (videos can be large)
  async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const branch = formData.get("branch");

    if (!file || !(file instanceof File)) {
      return c.json<ErrorResponse>({ success: false, error: "Missing 'file' in form data" }, 400);
    }
    if (!branch || typeof branch !== "string") {
      return c.json<ErrorResponse>({ success: false, error: "Missing 'branch' in form data" }, 400);
    }
    if (!isAllowedContentType(file.type)) {
      return c.json<ErrorResponse>(
        { success: false, error: `Unsupported content type: ${file.type}. Allowed: image/png, image/jpeg, image/gif, image/webp, image/svg+xml, video/mp4, video/webm, video/quicktime` },
        400
      );
    }

    const key = generateStorageKey(branch, file.name);
    const metadata: ImageMetadata = {
      branch,
      originalFilename: file.name,
      uploadedAt: new Date().toISOString(),
      contentType: file.type,
    };

    await c.env.IMAGE_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: metadata as unknown as Record<string, string>,
    });

    const url = buildImageUrl(new URL(c.req.url).origin, key, branch);

    return c.json<UploadResponse>({
      success: true,
      key,
      url,
      branch,
      filename: file.name,
    }, 201);
  }
);

export { upload };
