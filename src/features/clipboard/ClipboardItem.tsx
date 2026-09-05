import { forwardRef, memo, useRef } from "react";
import type { KeyboardEvent } from "react";
import ItemActions from "../../components/ItemActions";
import ItemThumbnail from "../../components/ItemThumbnail";
import { normalizePreview } from "./normalizePreview";
import {
  contentTypeChipStyle,
  contentTypeSpineStyle,
  isCodeShaped,
  itemTypeLabel,
} from "../../lib/contentTypeColors";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/relativeTime";
import { useImageMeta } from "../../lib/imageMeta";
import { describeItem } from "../../lib/itemMetadata";
import type { LibraryItem } from "../../api/types";

// Every piece of metadata on a row shares one register, so the capture itself
// is the only thing set differently. Four registers competing with each other
// is what made the list read as chrome with the content buried in it.
const metaClass = "font-mono text-[0.64rem] tracking-[0.02em] text-[var(--text-muted)]";

/** A dot between two pieces of metadata. Quieter than the slash it replaces,
 *  and it does not read as part of a path when the neighbour is a file name. */
function MetaDot() {
  return (
    <span aria-hidden="true" className="text-[var(--text-muted)]/50">
      ·
    </span>
  );
}

function PinGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" />
      <path d="M12 14v6" />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3 fill-current">
      <path d="m12 4.5 2.3 4.9 5.2.7-3.8 3.6 1 5.3-4.7-2.6-4.7 2.6 1-5.3L4.5 10l5.2-.7L12 4.5Z" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

interface ClipboardItemProps {
  item: LibraryItem;
  selected: boolean;
  active?: boolean;
  busy: boolean;
  deleteDisabled?: boolean;
  compact?: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  multiSelect?: boolean;
  onToggleSelect?: () => void;
  onActivateMultiSelect?: () => void;
  revealed?: boolean;
  onReveal?: () => void;
}

const ClipboardItem = memo(forwardRef<HTMLDivElement, ClipboardItemProps>(
  function ClipboardItem(
    {
      item,
      selected,
      active = false,
      busy,
      deleteDisabled,
      compact = false,
      onSelect,
      onKeyDown,
      onCopy,
      onTogglePin,
      onToggleFavorite,
      onDelete,
      multiSelect = false,
      onToggleSelect,
      onActivateMultiSelect,
      revealed = false,
      onReveal,
    },
    ref,
  ) {
    const typeLabel = itemTypeLabel(item);
    const suppressFocusSelect = useRef(false);
    // Sensitive captures are masked in the list only. Copy is untouched - the
    // point of the app is still to hand you back what you copied.
    const masked = item.private && !revealed;
    const imageMeta = useImageMeta(item);
    const description = describeItem(item, imageMeta);

    return (
      <div
        ref={ref}
        id={`clipboard-item-${item.id}`}
        style={contentTypeSpineStyle(item.content_type)}
        className={
          // `scroll-mt-*` keeps a row clear of the sticky top bar when focus or
          // a pinned jump scrolls it into view.
          //
          // The left spine carries the content type, on every row. "What kind
          // of thing did I copy" is the first question asked of this list, so
          // that is what it is indexed by. Selection is the band tint instead,
          // which leaves the spine free to keep saying what the row holds.
          "group relative min-w-0 cursor-pointer select-none scroll-mt-24 border-b border-border/60 bg-transparent " +
          "transition-[background-color,box-shadow] duration-150 ease-out last:border-b-0 " +
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--spine)] " +
          "before:transition-[width] before:duration-150 before:ease-out " +
          // A second, very faint wash of the type colour on hover, so the row
          // lights up in its own colour rather than a generic grey.
          "hover:bg-[color-mix(in_srgb,var(--spine)_5%,var(--surface-2))] " +
          "data-[active]:bg-muted/45 " +
          "aria-selected:bg-[var(--accent-subtle)] aria-selected:text-[var(--accent-ink)] " +
          "aria-selected:before:w-[4px] aria-selected:before:bg-[var(--accent)] " +
          "focus-visible:z-[1] focus-visible:outline-offset-[-2px] motion-reduce:transition-none " +
          (compact ? "px-4 py-2" : "px-4 py-3")
        }
        role="option"
        aria-selected={selected}
        // The inspector shows the active row even before anything is selected,
        // so the row carries a quieter marker of its own.
        data-active={active || undefined}
        title="Click to copy · Ctrl+Click to select"
        tabIndex={active ? 0 : -1}
        onMouseDown={(e) => {
          suppressFocusSelect.current = e.ctrlKey || e.metaKey;
        }}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (!multiSelect) {
              onActivateMultiSelect?.();
            }
            onToggleSelect?.();
          } else if (!multiSelect) {
            onSelect();
            if (!busy) onCopy();
          }
        }}
        onFocus={() => {
          const suppress = suppressFocusSelect.current;
          suppressFocusSelect.current = false;
          if (!multiSelect && !suppress) onSelect();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!busy) onCopy();
            return;
          }
          onKeyDown(event);
        }}
      >
        <div className="flex items-start gap-3">
          {multiSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.()}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 size-4 shrink-0 cursor-pointer rounded border-border accent-primary"
              aria-label={`Select ${typeLabel} item`}
            />
          )}
          {/* Image captures lead with a fixed tile ahead of the text column,
              so every image row lines up with the next one instead of each
              being as tall as its own picture. */}
          {item.content_type === "image" && (
            <span className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-border bg-muted/60 p-1">
              <ItemThumbnail
                item={item}
                className="mt-0 h-[60px] w-[104px] rounded-sm border-0 object-cover"
              />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {/* The capture leads, at full contrast. It is the reason the row
                exists; everything else on it is a caption. Monospace is kept
                for content that is actually code-shaped - it is what makes a
                JSON row look different from a sentence. */}
            {/* A saved image keeps its name: the tile says it is a picture,
                the title says which one. */}
            {item.content_type === "image" && item.title?.trim() && (
              <p className="m-0 line-clamp-2 text-[0.8rem] font-medium leading-[1.4] text-foreground">
                {item.title.trim()}
              </p>
            )}
            {item.content_type !== "image" && (
              <pre
                className={
                  "m-0 max-w-full overflow-hidden whitespace-pre-wrap text-foreground [overflow-wrap:anywhere] " +
                  (isCodeShaped(item.content_type)
                    ? "line-clamp-1 font-mono text-[0.78rem] leading-[1.5]"
                    : "line-clamp-2 font-sans text-[0.8rem] leading-[1.5]") +
                  (masked ? " select-none blur-[4px]" : "")
                }
                aria-hidden={masked || undefined}
              >{normalizePreview(item.content)}</pre>
            )}

            <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${metaClass}`}>
              {/* Every row is chipped, plain text included: a chip on some
                  rows and not others is what stops the column being
                  scannable, and plain text is the majority case. */}
              <span
                className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
                style={contentTypeChipStyle(item.content_type)}
              >
                {typeLabel}
              </span>
              {description && (
                <>
                  <MetaDot />
                  <span>{description}</span>
                </>
              )}
              {item.source_app && (
                <>
                  <MetaDot />
                  <span className="max-w-[10rem] truncate" title={item.source_app}>
                    {item.source_app}
                  </span>
                </>
              )}
              {item.private && (
                <>
                  <MetaDot />
                  <span className="inline-flex items-center gap-1 text-[var(--warning)]">
                    <LockGlyph />
                    Private
                  </span>
                </>
              )}
              {masked && (
                <button
                  type="button"
                  className={`${metaClass} rounded-sm px-1 font-semibold text-primary underline underline-offset-2 transition-colors hover:bg-accent hover:text-primary`}
                  onClick={(event) => { event.stopPropagation(); onReveal?.(); }}
                  aria-label={`Reveal ${typeLabel} item`}
                >
                  Reveal
                </button>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {item.pinned && (
                  <span className="text-primary" title="Pinned">
                    <PinGlyph />
                    <span className="sr-only">Pinned</span>
                  </span>
                )}
                {item.favorite && (
                  <span className="text-[var(--warning)]" title="Favorite">
                    <StarGlyph />
                    <span className="sr-only">Favorite</span>
                  </span>
                )}
                <time
                  className="whitespace-nowrap tabular-nums"
                  dateTime={item.created_at}
                  title={formatAbsoluteTime(item.created_at)}
                >
                  {formatRelativeTime(item.created_at)}
                </time>
              </span>
            </div>
          </div>
          <ItemActions
            item={item}
            busy={busy}
            deleteDisabled={deleteDisabled}
            onCopy={onCopy}
            onTogglePin={onTogglePin}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
          />
        </div>
      </div>
    );
  },
));

export default ClipboardItem;
