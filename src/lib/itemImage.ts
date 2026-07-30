import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import type { LibraryItem } from "../api/types";

/// Image items store a relative path, so every thumbnail needs the app data
/// directory to build an absolute one. It never changes during a run, so the
/// lookup is resolved once and shared by every item on screen.
let dataDirectory: Promise<string> | null = null;

function appDirectory() {
  dataDirectory ??= appDataDir();
  return dataDirectory;
}

export async function itemImageSrc(relativePath: string) {
  // `join` rather than string concatenation: the stored path uses forward
  // slashes while the app data directory is native, Windows included.
  return convertFileSrc(await join(await appDirectory(), relativePath));
}

/// Resolves an item's thumbnail URL, or null while it is still resolving, for a
/// non-image item, or when the file behind it has gone missing.
export function useItemImage(item: LibraryItem): string | null {
  const [source, setSource] = useState<string | null>(null);
  const path = item.content_type === "image" ? item.content : null;

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
