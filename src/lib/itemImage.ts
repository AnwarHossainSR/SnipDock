import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import type { LibraryItem } from "../api/types";

/// Image items store a relative path, so every thumbnail needs the app data
/// directory to build an absolute one. It never changes during a run, so the
/// lookup is resolved once and shared by every item on screen.
let dataDirectory: Promise<string> | null = null;

function appDirectory() {
  if (dataDirectory === null) {
    dataDirectory = appDataDir().catch((error) => {
      // Reset on failure so subsequent calls retry instead of caching the
      // rejected promise permanently.
      dataDirectory = null;
      return Promise.reject(error);
    });
  }
  return dataDirectory;
}

export async function itemImageSrc(relativePath: string) {
  // `join` rather than string concatenation: the stored path uses forward
  // slashes while the app data directory is native, Windows included.
  return convertFileSrc(await join(await appDirectory(), relativePath));
}

/**
 * The downscaled copy written beside every stored image, derived from the same
 * path rather than stored, exactly as `images::relative_thumb_path` does it.
 *
 * A row draws at 112px; pointing it at the original meant the webview decoded a
 * full screenshot to paint that strip, and a page of a hundred of them decoded
 * hundreds of megabytes.
 */
export function thumbPathFor(relativePath: string): string {
  return relativePath.replace(/\.png$/, ".thumb.png");
}

/// Resolves an item's thumbnail URL, or null while it is still resolving, for a
/// non-image item, when there is no item at all, or when the file behind it has
/// gone missing. A null item is accepted so a caller that may have nothing
/// selected can still call this unconditionally, as the rules of hooks require.
export function useItemImage(
  item: LibraryItem | null,
  /** "thumb" asks for the downscaled copy, which a list row should always
   *  want. Captures stored before thumbnails existed have none, so the caller
   *  is expected to fall back to the original on a load error. */
  variant: "full" | "thumb" = "full",
): string | null {
  const [source, setSource] = useState<string | null>(null);
  const stored = item && item.content_type === "image" ? item.content : null;
  const path = stored && variant === "thumb" ? thumbPathFor(stored) : stored;

  useEffect(() => {
    if (path === null) {
      setSource(null);
      return;
    }
    let active = true;
    void itemImageSrc(path).then(
      (url) => {
        if (active) setSource(url);
      },
      () => {
        if (active) setSource(null);
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  return source;
}
