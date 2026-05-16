import type { Hono } from "hono";

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const ALLOWED_TEXT_TYPES = [
  "text/plain",
  "text/html"
]

export const ALLOWED_CONTENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_TEXT_TYPES
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

export interface MediaMetadata {
  repo: string;
  branch: string;
  originalFilename: string;
  uploadedAt: string;
  contentType: string;
}

/** @deprecated Use MediaMetadata */
export type ImageMetadata = MediaMetadata;

export interface UploadResponse {
  success: true;
  key: string;
  url: string;
  repo: string;
  branch: string;
  filename: string;
}

export interface UrlResponse {
  success: true;
  key: string;
  url: string;
}

export interface ListResponse {
  success: true;
  branch: string;
  images: { key: string; url: string; uploadedAt: string }[];
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type AppEnv = { Bindings: CloudflareBindings };
