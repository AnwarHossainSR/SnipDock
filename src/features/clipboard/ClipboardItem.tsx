import { forwardRef, memo, useRef } from "react";
import type { KeyboardEvent } from "react";
import ItemActions from "../../components/ItemActions";
import ItemThumbnail from "../../components/ItemThumbnail";
import { normalizePreview, previewLine } from "./normalizePreview";
import TypeTile from "../../components/TypeTile";
import {
  contentTypeTextStyle,
  displayTypeLabel,
  isCodeShaped,
} from "../../lib/contentTypeColors";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/relativeTime";
import { useImageMeta } from "../../lib/imageMeta";
import { describeItem } from "../../lib/itemMetadata";
import type { LibraryItem } from "../../api/types";

// Every piece of metadata on a row shares one register, so the capture itself
// is the only thing set differently. Four registers competing with each other
// is what made the list read as chrome with the content buried in it.
const metaClass = "font-mono text-[0.7rem] tracking-[0.01em] text-[var(--text-muted)]";

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
  /** Just copied: the row flashes in the accent and settles to its band. */
  flash?: boolean;
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
      flash = false,
    },
    ref,
  ) {
    const typeLabel = displayTypeLabel(item);
    const suppressFocusSelect = useRef(false);
    // Whether the press that produced this click began on one of the row's
    // own controls. A control's click never reaches the row - the actions
    // stop it - but when the row moves between press and release, the
    // browser sends the click to the element both ends share, which is the
    // row, and a press on "More actions" became a copy.
    const pressedControl = useRef(false);
    // Sensitive captures are masked in the list only. Copy is untouched - the
    // point of the app is still to hand you back what you copied.
    const masked = item.private && !revealed;
    const imageMeta = useImageMeta(item);
    const description = describeItem(item, imageMeta);

    return (
      <div
        ref={ref}
        id={`clipboard-item-${item.id}`}
        className={
          // `scroll-mt-*` keeps a row clear of the sticky top bar when focus or
          // a pinned jump scrolls it into view.
          //
          // What a capture is, is said by its type tile; selection is the
          // accent band with a short bar at the left edge, so the two never
          // compete for the same stripe.
          "group relative min-w-0 cursor-pointer select-none scroll-mt-24 border-b border-border/60 bg-transparent " +
          "transition-[background-color] duration-150 ease-out last:border-b-0 " +
          "hover:bg-card data-[active]:bg-card " +
          "aria-selected:bg-[var(--accent-subtle)] " +
          "aria-selected:before:absolute aria-selected:before:inset-y-2.5 aria-selected:before:left-0 aria-selected:before:w-[3px] aria-selected:before:rounded-r-[3px] aria-selected:before:bg-[var(--accent)] " +
          "data-[flash]:animate-[row-flash_900ms_ease-out] " +
          "focus-visible:z-[1] focus-visible:outline-offset-[-2px] motion-reduce:transition-none " +
          (compact ? "py-2 pl-[18px] pr-3" : "py-3 pl-[18px] pr-3")
        }
        role="option"
        aria-selected={selected}
        // The inspector shows the active row even before anything is selected,
        // so the row carries a quieter marker of its own.
        data-active={active || undefined}
        data-flash={flash || undefined}
        title="Click to copy · Ctrl+Click to select"
        tabIndex={active ? 0 : -1}
        onMouseDown={(e) => {
          suppressFocusSelect.current = e.ctrlKey || e.metaKey;
          pressedControl.current =
            e.target !== e.currentTarget &&
            (e.target as HTMLElement).closest("button, input, a, select, textarea") !== null;
        }}
        onClick={(e) => {
          const fromControl = pressedControl.current;
          pressedControl.current = false;
          if (fromControl) return;
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
        <div className="flex items-start gap-[13px]">
          {multiSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.()}
              onClick={(e) => e.stopPropagation()}
              className="mt-2 size-4 shrink-0 cursor-pointer rounded border-border accent-primary"
              aria-label={`Select ${typeLabel} item`}
            />
          )}
          {/* An image leads with a small, fixed tile of itself; everything
              else with its type tile, so every row lines up with the next. */}
          {item.content_type === "image" ? (
            <span className="inline-flex h-[38px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-border bg-white">
              <ItemThumbnail item={item} className="mt-0 h-full w-full rounded-none border-0 object-cover" />
            </span>
          ) : (
            <TypeTile item={item} className="mt-px" />
          )}
          <div className="min-w-0 flex-1">
            {/* Level with the capture's first line. It gives way to the row's
                actions on hover, which float over the same corner. */}
            <time
              className={`float-right ml-3 mt-0.5 ${metaClass} whitespace-nowrap tabular-nums transition-opacity duration-100 group-hover:opacity-0 group-focus-within:opacity-0`}
              dateTime={item.created_at}
              title={formatAbsoluteTime(item.created_at)}
            >
              {formatRelativeTime(item.created_at)}
            </time>
            {/* The capture leads, at full contrast. It is the reason the row
                exists; everything else on it is a caption. Monospace is kept
                for content that is actually code-shaped - it is what makes a
                JSON row look different from a sentence. */}
            {/* A saved image keeps its name: the tile says it is a picture,
                the title says which one. Without one, the meta line says it
                all and a second "Image" would only repeat it. */}
            {item.content_type === "image" && item.title?.trim() && (
              <p className="m-0 line-clamp-1 text-[0.84rem] font-medium leading-[1.5] text-foreground">
                {item.title.trim()}
              </p>
            )}
            {item.content_type !== "image" && (
              <pre
                className={
                  "m-0 max-w-full overflow-hidden whitespace-pre-wrap text-foreground [overflow-wrap:anywhere] " +
                  (isCodeShaped(item.content_type)
                    ? "line-clamp-1 font-mono text-[0.78rem] leading-[1.55]"
                    : "line-clamp-2 font-sans text-[0.84rem] leading-[1.5]") +
                  (masked ? " select-none blur-[4px]" : "")
                }
                aria-hidden={masked || undefined}
              >
                {/* Code-shaped rows clamp to one line, and that line has to
                    say something: pretty JSON's first line is a lone "{". */}
                {isCodeShaped(item.content_type)
                  ? previewLine(item.content, item.content_type)
                  : normalizePreview(item.content)}
              </pre>
            )}

            <div className={`mt-[5px] flex flex-wrap items-center gap-x-1.5 gap-y-1 ${metaClass}`}>
              {/* The type in its own colour, the one the tile is tinted with. */}
              <span className="font-sans font-semibold tracking-normal" style={contentTypeTextStyle(item.content_type)}>
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
                  <span className="inline-flex items-center gap-1 font-sans font-semibold tracking-normal text-[var(--warning)]">
                    <LockGlyph />
                    Private
                  </span>
                </>
              )}
              {masked && (
                <button
                  type="button"
                  className={`${metaClass} rounded-sm px-1 font-sans font-semibold tracking-normal text-primary underline underline-offset-2 transition-colors hover:bg-accent hover:text-primary`}
                  onClick={(event) => { event.stopPropagation(); onReveal?.(); }}
                  aria-label={`Reveal ${typeLabel} item`}
                >
                  Reveal
                </button>
              )}
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
