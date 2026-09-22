import { useState } from "react";
import type { LibraryItem } from "../api/types";
import { cn } from "../lib/utils";
import { useItemImage } from "../lib/itemImage";

interface ItemThumbnailProps {
  item: LibraryItem;
  className?: string;
  /** Rows want the downscaled copy; the inspector wants the real thing. */
  variant?: "full" | "thumb";
}

/// Preview for a clipboard image item. Falls back to a caption whenever the
/// picture cannot be shown -- while the path is still resolving, when the file
/// has been removed underneath us, or when the item is marked private -- so the
/// stored path is never rendered as if it were the copied text.
///
/// Rendered inside a `<button>` on the Quick Paste list, so the fallback is a
/// `<span>`: a block-level element there would be invalid nesting.
export default function ItemThumbnail({
  item,
  className,
  variant = "thumb",
}: ItemThumbnailProps) {
  // A capture stored before thumbnails existed has no downscaled copy, so a
  // failed thumbnail load falls back to the original once before giving up.
  // Without that step every older image in the history would read as
  // "Image unavailable".
  const [fellBack, setFellBack] = useState(false);
  const effective = variant === "thumb" && !fellBack ? "thumb" : "full";
  const source = useItemImage(item, effective);
  const [failed, setFailed] = useState(false);

  if (item.private || source === null || failed) {
    return (
      <span className={cn("mt-2 block font-mono text-xs text-muted-foreground", className)}>
        {item.private ? "Private image" : failed ? "Image unavailable" : "Image"}
      </span>
    );
  }

  return (
    <img
      src={source}
      alt="Captured clipboard image"
      loading="lazy"
      decoding="async"
      onError={() => {
        if (effective === "thumb") setFellBack(true);
        else setFailed(true);
      }}
      className={cn(
        "mt-2 block max-h-28 w-auto max-w-full rounded-sm border border-border object-contain",
        className,
      )}
    />
  );
}
