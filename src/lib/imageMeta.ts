import { useEffect, useState } from "react";
import type { LibraryItem } from "../api/types";
import { useItemImage } from "./itemImage";

export interface ImageMeta {
  width: number;
  height: number;
  bytes: number | null;
}

/// Pixel dimensions and file size for an image item, read from the resolved
/// asset itself (no backend field carries either yet). Dimensions come from
/// decoding the image; size from re-reading it as a blob - both client-side,
/// no new dependency or Tauri command.
export function useImageMeta(item: LibraryItem): ImageMeta | null {
  const source = useItemImage(item);
  const [meta, setMeta] = useState<ImageMeta | null>(null);

  useEffect(() => {
    if (!source) {
      setMeta(null);
      return;
    }
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      setMeta((current) => ({ width: img.naturalWidth, height: img.naturalHeight, bytes: current?.bytes ?? null }));
    };
    img.src = source;

    void fetch(source)
      .then((response) => response.blob())
      .then((blob) => {
        if (active) setMeta((current) => ({ width: current?.width ?? 0, height: current?.height ?? 0, bytes: blob.size }));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [source]);

  return meta;
}
