import { forwardRef, memo, useRef } from "react";
import type { KeyboardEvent } from "react";
import ItemActions from "../../components/ItemActions";
import ItemThumbnail from "../../components/ItemThumbnail";
import { normalizePreview } from "./normalizePreview";
import TypeTile from "../../components/TypeTile";
import {
  contentTypeTextStyle,
  displayTypeLabel,
  isBareLink,
  isCodeShaped,
} from "../../lib/contentTypeColors";
import { cn } from "@/lib/utils";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/relativeTime";
import { useImageMeta } from "../../lib/imageMeta";
import { describeItem } from "../../lib/itemMetadata";
import type { LibraryItem } from "../../api/types";

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

/** A bare link, split for its card: the host and path as the label, the
 *  whole address beneath it. Anything the URL parser refuses is shown as is. */
function parseLink(content: string): { label: string; address: string } {
  const address = content.trim();
  try {
    const url = new URL(address);
    const path = url.pathname === "/" ? "" : url.pathname;
    return { label: `${url.hostname.replace(/^www\./, "")}${path}`, address };
  } catch {
    return { label: address, address };
  }
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

    const link = !masked && isBareLink(item) ? parseLink(item.content) : null;
    const code = isCodeShaped(item.content_type);

    return (
      <div
        ref={ref}
        id={`clipboard-item-${item.id}`}
        className={
          // A capture is a card lifted off the page, drawn by its shadow - a
          // hairline ring and a soft drop - with its type named at the top in
          // the type's own colour. Selection is a 2px accent ring, also a
          // shadow, so selecting never shifts a card's contents. The border
          // stays transparent for the same reason; a masked card uses it,
          // dashed, in place of the shadow.
          "group relative flex min-w-0 cursor-pointer select-none flex-col gap-2.5 rounded-[12px] border border-transparent bg-card scroll-mt-16 " +
          "shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-150 ease-out " +
          "not-aria-selected:hover:shadow-[var(--shadow-card-hover)] not-aria-selected:data-[active]:shadow-[var(--shadow-card-hover)] " +
          "aria-selected:shadow-[0_0_0_2px_var(--accent),var(--shadow-card-hover)] " +
          "data-[masked]:border-dashed data-[masked]:border-[var(--border-strong)] data-[masked]:bg-transparent not-aria-selected:data-[masked]:shadow-none " +
          "data-[flash]:animate-[row-flash_900ms_ease-out] " +
          "focus-visible:outline-offset-2 motion-reduce:transition-none " +
          (compact ? "px-4 py-3" : "px-[18px] py-4")
        }
        role="option"
        aria-selected={selected}
        // The reading panel shows the active card even before anything is
        // selected, so the card carries a quieter marker of its own.
        data-active={active || undefined}
        data-flash={flash || undefined}
        data-masked={masked || undefined}
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
        {/* The stamp: what it is, where it came from, when. The time gives
            way to the card's actions on hover, which float over the corner. */}
        <div className="flex min-w-0 items-center gap-2 text-[0.7rem] uppercase tracking-[0.06em]">
          {multiSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.()}
              onClick={(e) => e.stopPropagation()}
              className="size-4 shrink-0 cursor-pointer rounded border-border accent-primary"
              aria-label={`Select ${typeLabel} item`}
            />
          )}
          <span className="shrink-0 font-semibold" style={contentTypeTextStyle(item.content_type)}>
            {typeLabel}
          </span>
          {item.source_app && (
            <>
              <MetaDot />
              <span className="min-w-0 truncate normal-case tracking-normal text-muted-foreground" title={item.source_app}>
                {item.source_app}
              </span>
            </>
          )}
          <span className="flex-1" />
          <time
            className="shrink-0 whitespace-nowrap normal-case tracking-normal tabular-nums text-muted-foreground transition-opacity duration-100 group-hover:opacity-0 group-focus-within:opacity-0"
            dateTime={item.created_at}
            title={formatAbsoluteTime(item.created_at)}
          >
            {formatRelativeTime(item.created_at)}
          </time>
        </div>

        {/* The capture itself, set by what it is. */}
        {masked ? (
          // Nothing of the text is drawn until it is revealed - not even
          // blurred, which a screenshot or a zoom can undo. Copy still works:
          // handing back what was copied is the point of the app.
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--type-secret)_12%,transparent)] text-[var(--type-secret)]">
              <LockGlyph />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.875rem] font-semibold text-foreground">Hidden until revealed</span>
              <span className="text-[0.78rem] text-muted-foreground">Looks like a credential · copy still works</span>
            </span>
            <button
              type="button"
              className="min-h-0 shrink-0 rounded-md px-2 py-1 text-[0.78rem] font-semibold text-primary underline underline-offset-2 transition-colors hover:bg-accent"
              onClick={(event) => { event.stopPropagation(); onReveal?.(); }}
              aria-label={`Reveal ${typeLabel} item`}
            >
              Reveal
            </button>
          </div>
        ) : item.content_type === "image" ? (
          <>
            <span className="block h-[118px] overflow-hidden rounded-[9px] border border-border bg-[var(--surface-2)]">
              <ItemThumbnail item={item} className="mt-0 h-full w-full rounded-none border-0 object-cover" />
            </span>
            {item.title?.trim() && (
              <p className="m-0 line-clamp-1 text-[0.875rem] font-medium text-foreground">{item.title.trim()}</p>
            )}
          </>
        ) : link ? (
          <div className="flex min-w-0 items-center gap-3">
            <TypeTile item={item} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[0.875rem] font-semibold text-foreground">{item.title?.trim() || link.label}</span>
              <span className="truncate text-[0.78rem] text-muted-foreground">{link.address}</span>
            </span>
          </div>
        ) : (
          <pre
            className={cn(
              "m-0 max-w-full overflow-hidden text-foreground [overflow-wrap:anywhere]",
              code
                ? "line-clamp-5 whitespace-pre-wrap font-mono text-[0.78rem] leading-[1.6]"
                : "line-clamp-3 whitespace-pre-wrap text-[0.9rem] leading-[1.55]",
            )}
          >
            {normalizePreview(item.content)}
          </pre>
        )}

        {/* What else is true of it, as small labels at the foot. */}
        {(item.pinned || item.favorite || item.private || description) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem]">
            {item.pinned && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-subtle)] px-2 py-0.5 font-medium text-[var(--accent-ink)]" title="Pinned">
                <PinGlyph />
                Pinned
              </span>
            )}
            {item.favorite && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-0.5 font-medium text-[var(--warning)]" title="Favorite">
                <StarGlyph />
                Favorite
              </span>
            )}
            {item.private && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-0.5 font-medium text-[var(--warning)]">
                <LockGlyph />
                Private
              </span>
            )}
            {description && (
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[0.66rem] text-muted-foreground">
                {description}
              </span>
            )}
          </div>
        )}

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
    );
  },
));

export default ClipboardItem;
