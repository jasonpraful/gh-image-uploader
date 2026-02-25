import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ALLOWED_IMAGE_TYPES, ALLOWED_CONTENT_TYPES } from "./types";
import type { MediaMetadata } from "./types";
import { generateStorageKey, isAllowedImageType, buildImageUrl } from "./utils/storage";

export class ImageUploaderMCP extends McpAgent<CloudflareBindings> {
  server = new McpServer({ name: "gh-image-uploader", version: "1.0.0" });

  private get baseUrl(): string {
    return this.env.WORKER_URL;
  }

  async init() {
    // Tool 1: upload_image — images only (base64 over MCP)
    this.server.registerTool(
      "upload_image",
      {
        description:
          "Upload an image to R2 for use in GitHub PRs via base64. Best for small images. For large files (>500KB), use the get_upload_command tool instead to upload via HTTP multipart.",
        inputSchema: {
          filename: z.string().describe("Image filename, e.g. screenshot.png"),
          repo: z.string().describe("Repository name, e.g. owner/repo"),
          branch: z.string().describe("Git branch name this image belongs to"),
          content_base64: z.string().describe("Base64-encoded image content"),
          content_type: z
            .enum(ALLOWED_IMAGE_TYPES)
            .describe("MIME type of the image"),
        },
      },
      async ({ filename, repo, branch, content_base64, content_type }) => {
        if (!isAllowedImageType(content_type)) {
          return { content: [{ type: "text" as const, text: `Error: unsupported image type '${content_type}'. Use the get_upload_command tool for videos.` }] };
        }

        const bytes = Uint8Array.from(atob(content_base64), (ch) => ch.charCodeAt(0));
        const key = generateStorageKey(repo, branch, filename);
        const metadata: MediaMetadata = {
          repo,
          branch,
          originalFilename: filename,
          uploadedAt: new Date().toISOString(),
          contentType: content_type,
        };

        await this.env.IMAGE_BUCKET.put(key, bytes, {
          httpMetadata: { contentType: content_type },
          customMetadata: metadata as unknown as Record<string, string>,
        });

        const url = buildImageUrl(this.baseUrl, key, repo, branch);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, key, url, repo, branch, filename }),
            },
          ],
        };
      }
    );

    // Tool 2: get_upload_command — returns curl command for HTTP multipart upload (any file type)
    this.server.registerTool(
      "get_upload_command",
      {
        description:
          "Get a ready-to-run curl command for uploading a file via the HTTP endpoint. Use this for videos, large images, or any file too large for base64 MCP transfer. No authentication required.",
        inputSchema: {
          filename: z.string().describe("Filename, e.g. demo.mp4 or screenshot.png"),
          repo: z.string().describe("Repository name, e.g. owner/repo"),
          branch: z.string().describe("Git branch name this file belongs to"),
          file_path: z.string().describe("Local file path, e.g. /tmp/demo.mp4"),
        },
      },
      async ({ filename, repo, branch, file_path }) => {
        const curlCommand = [
          `curl -X POST ${this.baseUrl}/upload \\`,
          `  -F "file=@${file_path}" \\`,
          `  -F "repo=${repo}" \\`,
          `  -F "branch=${branch}"`,
        ].join("\n");

        const supportedTypes = ALLOWED_CONTENT_TYPES.map((t) => `- \`${t}\``).join("\n");

        const instructions = [
          `## Upload: ${filename}`,
          "",
          "Run this curl command to upload via HTTP multipart:",
          "",
          "```bash",
          curlCommand,
          "```",
          "",
          `The response JSON will contain a \`url\` you can embed directly in markdown:`,
          "```markdown",
          `![${filename}](<url-from-response>)`,
          "```",
          "",
          `### Supported types`,
          supportedTypes,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: instructions }],
        };
      }
    );

    // Tool 3: get_image_url — get serving URL for an existing image or video
    this.server.registerTool(
      "get_image_url",
      {
        description: "Get the serving URL for a previously uploaded image or video",
        inputSchema: {
          key: z.string().describe("The R2 storage key returned from upload"),
        },
      },
      async ({ key }) => {
        const object = await this.env.IMAGE_BUCKET.head(key);
        if (!object) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "File not found" }) }] };
        }

        const repo = object.customMetadata?.repo;
        const branch = object.customMetadata?.branch;
        if (!repo || !branch) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "File metadata missing repo or branch" }) }] };
        }

        const url = buildImageUrl(this.baseUrl, key, repo, branch);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, key, url }) }],
        };
      }
    );

    // Tool 4: list_images — list all uploads for a branch
    this.server.registerTool(
      "list_images",
      {
        description: "List all uploaded images and videos for a given repo and branch",
        inputSchema: {
          repo: z.string().describe("Repository name, e.g. owner/repo"),
          branch: z.string().describe("Git branch name to list uploads for"),
        },
      },
      async ({ repo, branch }) => {
        const sanitize = (s: string) =>
          s.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

        const prefix = `${sanitize(repo)}/${sanitize(branch)}`;

        const listed = await this.env.IMAGE_BUCKET.list({ prefix: `${prefix}/` });

        const files = listed.objects.map((obj) => ({
          key: obj.key,
          url: buildImageUrl(this.baseUrl, obj.key, repo, branch),
          uploadedAt: obj.customMetadata?.uploadedAt ?? obj.uploaded.toISOString(),
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, repo, branch, files }),
            },
          ],
        };
      }
    );
  }
}
