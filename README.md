# gh-image-uploader

Upload images and videos to get shareable URLs for GitHub PRs. Powered by Cloudflare Workers, R2, and Durable Objects.

Exposes both an HTTP API and an [MCP server](https://modelcontextprotocol.io) so AI tools (Claude Code, Cursor, etc.) can upload images directly.

**Hosted at:** `https://gh-image-uploader.jasonpraful.workers.dev`

## How it works

Files are stored in Cloudflare R2, keyed by `{repo}/{branch}/{timestamp}-{filename}`. Serving URLs require both `repo` and `branch` query params — these are checked against the stored metadata, so images are only accessible if you know the correct repo + branch combination.

## HTTP API

### Upload a file

```bash
curl -X POST https://gh-image-uploader.jasonpraful.workers.dev/upload \
  -F "file=@screenshot.png" \
  -F "repo=owner/repo-name" \
  -F "branch=feat/my-feature"
```

Response:

```json
{
  "success": true,
  "key": "owner-repo-name/feat-my-feature/1709000000000-screenshot.png",
  "url": "https://gh-image-uploader.jasonpraful.workers.dev/images/owner-repo-name/feat-my-feature/1709000000000-screenshot.png?repo=owner/repo-name&branch=feat/my-feature",
  "repo": "owner/repo-name",
  "branch": "feat/my-feature",
  "filename": "screenshot.png"
}
```

### Serve a file

```
GET /images/<key>?repo=owner/repo-name&branch=feat/my-feature
```

Returns the file with correct `Content-Type` and immutable caching headers. Returns `403` if `repo` or `branch` doesn't match the stored metadata.

### Get URL for a stored file

```
GET /url/<key>
```

### List files for a branch

```
GET /list/<branch>?repo=owner/repo-name
```

## MCP Server

The MCP server lets AI tools upload images and manage files directly. Connect using either transport:

| Transport | Endpoint |
|-----------|----------|
| Streamable HTTP | `https://gh-image-uploader.jasonpraful.workers.dev/mcp` |
| SSE (legacy) | `https://gh-image-uploader.jasonpraful.workers.dev/sse` |

### Claude Code

```bash
claude mcp add gh-image-uploader --transport sse https://gh-image-uploader.jasonpraful.workers.dev/sse
```

### Claude Desktop / Cursor

Add to your MCP config:

```json
{
  "mcpServers": {
    "gh-image-uploader": {
      "url": "https://gh-image-uploader.jasonpraful.workers.dev/sse"
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `upload_image` | Upload a base64-encoded image to R2. Best for small images (<500KB). |
| `get_upload_command` | Get a curl command for uploading via HTTP. Use for videos and large files. |
| `get_image_url` | Get the serving URL for a previously uploaded file. |
| `list_images` | List all uploads for a given repo and branch. |

## Supported file types

**Images:** `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`

**Videos:** `video/mp4`, `video/webm`, `video/quicktime`

**Text:** `text/plain`, `text/html`

Max upload size: 100 MB.

## Development

```bash
bun install
bun run dev          # Start local dev server (Miniflare)
bun run cf-typegen   # Regenerate CloudflareBindings types
bun run deploy       # Deploy to Cloudflare Workers
```

### First-time setup

```bash
# Create the R2 bucket
bunx wrangler r2 bucket create gh-pr-images
```
