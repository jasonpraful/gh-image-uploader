import { ALLOWED_CONTENT_TYPES, ALLOWED_IMAGE_TYPES, type AllowedContentType, type AllowedImageType } from "../types";

/**
 * Sanitize a string for use in an R2 key — replace unsafe characters with dashes.
 */
function sanitize(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate an R2 storage key: `{sanitized-branch}/{timestamp}-{sanitized-filename}`
 */
export function generateStorageKey(
  branch: string,
  filename: string
): string {
  const sanitizedBranch = sanitize(branch);
  const sanitizedFilename = sanitize(filename);
  const timestamp = Date.now();
  return `${sanitizedBranch}/${timestamp}-${sanitizedFilename}`;
}

/**
 * Type guard for all allowed content types (images + videos).
 */
export function isAllowedContentType(
  type: string
): type is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(type);
}

/**
 * Type guard for image-only content types.
 */
export function isAllowedImageType(
  type: string
): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Build a full serving URL for an image, including the branch query param.
 */
export function buildImageUrl(
  baseUrl: string,
  key: string,
  branch: string
): string {
  const url = new URL(`/images/${key}`, baseUrl);
  url.searchParams.set("branch", branch);
  return url.toString();
}
