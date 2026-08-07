import { forwardRef, memo, useRef } from "react";
import type { KeyboardEvent } from "react";
import ItemActions from "../../components/ItemActions";
import ItemThumbnail from "../../components/ItemThumbnail";
import { normalizePreview } from "./normalizePreview";
import { contentTypeColorStyle } from "../../lib/contentTypeColors";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/relativeTime";
import { useImageMeta } from "../../lib/imageMeta";
import { describeItem } from "../../lib/itemMetadata";
import type { LibraryItem } from "../../api/types";

const contentTypeLabels = {
  plain_text: "Plain text",
  code: "Code",
  json: "JSON",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  xml: "XML",
  shell: "Shell",
  markdown: "Markdown",
  config: "Config",
  image: "Image",
} as const;

// Shared shape for the pinned/favorite flags so only their colour differs.
const flagChip =
  "whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase";

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
    const typeLabel = item.content_type === "code" && item.language ? item.language : contentTypeLabels[item.content_type];
    const suppressFocusSelect = useRef(false);
    // Sensitive captures are masked in the list only. Copy is untouched - the
    // point of the app is still to hand you back what you copied.
    const masked = item.private && !revealed;
    const imageMeta = useImageMeta(item);

    return (
      <div
        ref={ref}
        id={`clipboard-item-${item.id}`}
        className={
          // `scroll-mt-*` keeps a row clear of the sticky top bar when focus or
          // a pinned jump scrolls it into view.
          "group relative mb-1 min-w-0 cursor-pointer select-none scroll-mt-24 rounded-md border border-transparent bg-transparent transition-colors last:mb-0 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent before:transition-colors data-[active]:before:bg-primary/45 hover:border-border hover:bg-muted aria-selected:border-primary/35 aria-selected:bg-accent/60 aria-selected:before:bg-primary focus-visible:z-[1] focus-visible:outline-offset-[-2px] " +
          (compact ? "px-3 py-1.5" : "px-4 py-3")
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
        <div className="flex items-center gap-4">
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
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 text-[0.68rem] text-[var(--color-text-subtle)]">
            <span
              className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em]"
              style={contentTypeColorStyle(item.content_type)}
            >
              {typeLabel}
            </span>
            <span className="flex flex-wrap gap-2 text-[0.68rem] font-semibold text-[var(--color-warning)]">
              {item.private && <span className="inline-flex items-center whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-[var(--color-warning)]"><svg className="mr-1 size-3 fill-none stroke-current stroke-2" aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Private</span>}
              {masked && (
                <button
                  type="button"
                  className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.02em] text-muted-foreground hover:border-primary hover:text-primary"
                  onClick={(event) => { event.stopPropagation(); onReveal?.(); }}
                  aria-label={`Reveal ${typeLabel} item`}
                >
                  Reveal
                </button>
              )}
              {item.pinned && (
                <span className={`${flagChip} bg-accent text-accent-foreground`}>Pinned</span>
              )}
              {item.favorite && (
                <span className={`${flagChip} text-[var(--color-warning)] [background:color-mix(in_srgb,var(--color-warning)_14%,transparent)]`}>
                  Favorite
                </span>
              )}
            </span>
            <time
              className="ml-auto whitespace-nowrap font-mono text-[0.68rem]"
              dateTime={item.created_at}
              title={formatAbsoluteTime(item.created_at)}
            >
              {formatRelativeTime(item.created_at)}
            </time>
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
        {item.content_type === "image"
          ? <ItemThumbnail item={item} className="mt-2 h-8 max-h-8 w-auto max-w-[46px]" />
          : <pre
              className={`mt-2 line-clamp-3 max-w-full overflow-hidden whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]${masked ? " select-none blur-[4px]" : ""}`}
              aria-hidden={masked || undefined}
            >{normalizePreview(item.content)}</pre>}
        <p className="m-0 mt-1 font-mono text-[0.62rem] text-[var(--color-text-subtle)]">
          {describeItem(item, imageMeta)}
        </p>
      </div>
    );
  },
));

export default ClipboardItem;
