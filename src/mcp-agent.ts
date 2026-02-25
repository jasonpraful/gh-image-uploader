import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from "./types";
import type { MediaMetadata } from "./types";
import { generateStorageKey, isAllowedImageType, buildImageUrl } from "./utils/storage";

export class ImageUploaderMCP extends McpAgent<CloudflareBindings> {
  server = new McpServer({ name: "gh-image-uploader", version: "1.0.0" });

  async init() {
    // Tool 1: upload_image — images only (base64 over MCP)
    this.server.tool(
      "upload_image",
      "Upload an image to R2 for use in GitHub PRs. Returns the storage key and a serving URL. For videos, use the upload_video_instructions tool instead.",
      {
        filename: z.string().describe("Image filename, e.g. screenshot.png"),
        branch: z.string().describe("Git branch name this image belongs to"),
        content_base64: z.string().describe("Base64-encoded image content"),
        content_type: z
          .enum(ALLOWED_IMAGE_TYPES)
          .describe("MIME type of the image"),
      },
      async ({ filename, branch, content_base64, content_type }) => {
        if (!isAllowedImageType(content_type)) {
          return { content: [{ type: "text" as const, text: `Error: unsupported image type '${content_type}'. For videos, use the upload_video_instructions tool.` }] };
        }

        const bytes = Uint8Array.from(atob(content_base64), (ch) => ch.charCodeAt(0));
        const key = generateStorageKey(branch, filename);
        const metadata: MediaMetadata = {
          branch,
          originalFilename: filename,
          uploadedAt: new Date().toISOString(),
          contentType: content_type,
        };

        await this.env.IMAGE_BUCKET.put(key, bytes, {
          httpMetadata: { contentType: content_type },
          customMetadata: metadata as unknown as Record<string, string>,
        });

        const url = `/images/${key}?branch=${encodeURIComponent(branch)}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, key, url, branch, filename }),
            },
          ],
        };
      }
    );

    // Tool 2: upload_video_instructions — returns curl command for HTTP upload
    this.server.tool(
      "upload_video_instructions",
      "Get instructions and a ready-to-run curl command for uploading a video via the HTTP endpoint. Videos are too large for MCP base64 transfer — use the HTTP multipart upload instead.",
      {
        filename: z.string().describe("Video filename, e.g. demo.mp4"),
        branch: z.string().describe("Git branch name this video belongs to"),
        file_path: z.string().describe("Local file path to the video, e.g. /tmp/demo.mp4"),
        base_url: z.string().optional().describe("Base URL of the worker (e.g. https://gh-image-uploader.<account>.workers.dev). If omitted, uses a placeholder."),
      },
      async ({ filename, branch, file_path, base_url }) => {
        const workerUrl = base_url ?? "https://<YOUR_WORKER_URL>";

        const curlCommand = [
          `curl -X POST ${workerUrl}/upload \\`,
          `  -H "Authorization: Bearer $UPLOAD_API_KEY" \\`,
          `  -F "file=@${file_path}" \\`,
          `  -F "branch=${branch}"`,
        ].join("\n");

        const instructions = [
          `## Upload video: ${filename}`,
          "",
          "Videos can't be uploaded via MCP (too large for base64). Use the HTTP endpoint instead.",
          "",
          "### Steps",
          `1. Ensure the video file exists at: \`${file_path}\``,
          `2. Set your API key: \`export UPLOAD_API_KEY="<your-key>"\``,
          "3. Run the following curl command:",
          "",
          "```bash",
          curlCommand,
          "```",
          "",
          `4. The response will contain a \`key\` and a \`url\` you can embed in your PR.`,
          "",
          `### Supported video types`,
          ALLOWED_VIDEO_TYPES.map((t) => `- \`${t}\``).join("\n"),
          "",
          `### Embed in markdown`,
          `After uploading, use the returned URL in your PR:`,
          "```markdown",
          `![${filename}](<returned-url>)`,
          "```",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: instructions }],
        };
      }
    );

    // Tool 3: get_image_url — get serving URL for an existing image or video
    this.server.tool(
      "get_image_url",
      "Get the serving URL for a previously uploaded image or video",
      {
        key: z.string().describe("The R2 storage key returned from upload"),
      },
      async ({ key }) => {
        const object = await this.env.IMAGE_BUCKET.head(key);
        if (!object) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "File not found" }) }] };
        }

        const branch = object.customMetadata?.branch;
        if (!branch) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "File metadata missing branch" }) }] };
        }

        const url = `/images/${key}?branch=${encodeURIComponent(branch)}`;
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, key, url }) }],
        };
      }
    );

    // Tool 4: list_images — list all uploads for a branch
    this.server.tool(
      "list_images",
      "List all uploaded images and videos for a given branch",
      {
        branch: z.string().describe("Git branch name to list uploads for"),
      },
      async ({ branch }) => {
        const prefix = branch
          .replace(/[^a-zA-Z0-9._-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const listed = await this.env.IMAGE_BUCKET.list({ prefix: `${prefix}/` });

        const files = listed.objects.map((obj) => ({
          key: obj.key,
          url: `/images/${obj.key}?branch=${encodeURIComponent(branch)}`,
          uploadedAt: obj.customMetadata?.uploadedAt ?? obj.uploaded.toISOString(),
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, branch, files }),
            },
          ],
        };
      }
    );
  }
}
