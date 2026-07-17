import { forwardRef } from "react";
import type { KeyboardEvent } from "react";
import ItemActions from "../../components/ItemActions";
import type { LibraryItem } from "../../lib/types";

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
} as const;

function formatCapturedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

interface ClipboardItemProps {
  item: LibraryItem;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

const ClipboardItem = forwardRef<HTMLDivElement, ClipboardItemProps>(
  function ClipboardItem(
    {
      item,
      selected,
      busy,
      onSelect,
      onKeyDown,
      onCopy,
      onTogglePin,
      onToggleFavorite,
      onDelete,
    },
    ref,
  ) {
    const typeLabel = contentTypeLabels[item.content_type];

    return (
      <div
        ref={ref}
        id={`clipboard-item-${item.id}`}
        className="clipboard-item"
        role="option"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        onClick={onSelect}
        onFocus={onSelect}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget) onKeyDown(event);
        }}
      >
        <div className="clipboard-item-head">
          <div className="clipboard-item-meta">
            <span>{item.title?.trim() || typeLabel}</span>
            <time dateTime={item.created_at}>{formatCapturedAt(item.created_at)}</time>
          </div>
          <ItemActions
            item={item}
            busy={busy}
            onCopy={onCopy}
            onTogglePin={onTogglePin}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
          />
        </div>
        <pre className="clipboard-preview">{item.content}</pre>
      </div>
    );
  },
);

export default ClipboardItem;
