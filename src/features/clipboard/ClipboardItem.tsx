import { forwardRef, memo, useRef } from "react";
import type { KeyboardEvent } from "react";
import ItemActions from "../../components/ItemActions";
import ItemThumbnail from "../../components/ItemThumbnail";
import { normalizePreview } from "./normalizePreview";
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

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCapturedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return dateFormatter.format(date);
}

interface ClipboardItemProps {
  item: LibraryItem;
  selected: boolean;
  active?: boolean;
  busy: boolean;
  deleteDisabled?: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  multiSelect?: boolean;
  onToggleSelect?: () => void;
  onActivateMultiSelect?: () => void;
}

const ClipboardItem = memo(forwardRef<HTMLDivElement, ClipboardItemProps>(
  function ClipboardItem(
    {
      item,
      selected,
      active = false,
      busy,
      deleteDisabled,
      onSelect,
      onKeyDown,
      onCopy,
      onTogglePin,
      onToggleFavorite,
      onDelete,
      multiSelect = false,
      onToggleSelect,
      onActivateMultiSelect,
    },
    ref,
  ) {
    const typeLabel = item.content_type === "code" && item.language ? item.language : contentTypeLabels[item.content_type];
    const suppressFocusSelect = useRef(false);

    return (
      <div
        ref={ref}
        id={`clipboard-item-${item.id}`}
        className="group relative mb-1 min-w-0 cursor-pointer select-none rounded-sm border border-transparent bg-transparent px-4 py-3 last:mb-0 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent hover:bg-muted aria-selected:bg-muted aria-selected:before:bg-primary focus-visible:z-[1] focus-visible:outline-offset-[-2px]"
        role="option"
        aria-selected={selected}
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
            <span className="inline-flex whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-primary">{typeLabel}</span>
            <span className="flex flex-wrap gap-2 text-[0.68rem] font-semibold text-[var(--color-warning)]">
              {item.private && <span className="inline-flex items-center whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-[var(--color-warning)]"><svg className="mr-1 size-3 fill-none stroke-current stroke-2" aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Private</span>}
              {item.pinned && <span className="whitespace-nowrap rounded-full bg-[var(--color-chip)] px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase text-[var(--color-text-subtle)]">Pinned</span>}{item.favorite && <span className="whitespace-nowrap rounded-full bg-[var(--color-chip)] px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase text-[var(--color-text-subtle)]">Favorite</span>}
            </span>
            <time className="ml-auto whitespace-nowrap font-mono text-[0.68rem]" dateTime={item.created_at}>{formatCapturedAt(item.created_at)}</time>
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
          ? <ItemThumbnail item={item} />
          : <pre className="mt-2 line-clamp-3 max-w-full overflow-hidden whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{normalizePreview(item.content)}</pre>}
      </div>
    );
  },
));

export default ClipboardItem;
