import { api } from "./api";

export type MediaUploadSource = "editor" | "paste" | "drag-drop";

export interface MediaUploadOptions {
  noteId: string;
  file: File;
  source?: MediaUploadSource;
}

export interface MediaUploadResult {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  previewUrl: string;
  source: MediaUploadSource;
}

const VIDEO_FILE_EXTS = /\.(mp4|webm|ogg|ogv|m4v|mov)$/i;

export function isVideoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return VIDEO_FILE_EXTS.test(file.name || "");
}

export function toInlineAttachmentUrl(url: string): string {
  if (!url || /[?&]inline=1\b/.test(url)) return url;
  const [withoutHash, hash = ""] = url.split("#", 2);
  const sep = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${sep}inline=1${hash ? `#${hash}` : ""}`;
}

export async function uploadMediaAttachment(options: MediaUploadOptions): Promise<MediaUploadResult> {
  const { noteId, file, source = "editor" } = options;
  if (!noteId) {
    throw new Error("视频上传需要 noteId");
  }
  const res = await api.attachments.upload(noteId, file);
  return {
    attachmentId: res.id,
    filename: res.filename || file.name || "video",
    mimeType: res.mimeType || file.type || "application/octet-stream",
    size: res.size ?? file.size,
    url: res.url,
    previewUrl: toInlineAttachmentUrl(res.url),
    source,
  };
}
