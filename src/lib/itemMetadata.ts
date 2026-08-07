import type { LibraryItem } from "../api/types";
import { formatBytes } from "./formatBytes";
import type { ImageMeta } from "./imageMeta";

function jsonKeyCount(content: string): number | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
    return null;
  } catch {
    return null;
  }
}

/** Size/line-count line shown beneath a row's content, plus a type-specific detail where one applies. */
export function describeItem(item: LibraryItem, imageMeta: ImageMeta | null): string {
  if (item.content_type === "image") {
    if (!imageMeta) return "Image";
    const dims = imageMeta.width && imageMeta.height ? `${imageMeta.width}×${imageMeta.height}` : null;
    const size = imageMeta.bytes !== null ? formatBytes(imageMeta.bytes) : null;
    return [dims, size].filter(Boolean).join(" · ") || "Image";
  }

  const lines = item.content.split("\n").length;
  const lineLabel = `${lines.toLocaleString()} ${lines === 1 ? "line" : "lines"}`;

  if (item.content_type === "json") {
    const keys = jsonKeyCount(item.content);
    if (keys !== null) return `${lineLabel} · ${keys} ${keys === 1 ? "key" : "keys"}`;
  }

  return lineLabel;
}
