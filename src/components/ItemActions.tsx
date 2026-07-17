import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { LibraryItem } from "../lib/types";

interface ItemActionsProps {
  item: LibraryItem;
  busy: boolean;
  deleteDisabled?: boolean;
  archiveDisabled?: boolean;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onToggleArchive?: () => void;
}

export default function ItemActions({
  item,
  busy,
  deleteDisabled = false,
  archiveDisabled = false,
  onCopy,
  onTogglePin,
  onToggleFavorite,
  onDelete,
  onEdit,
  onDuplicate,
  onToggleArchive,
}: ItemActionsProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) firstAction.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const current = actions.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? actions.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % actions.length
            : (current - 1 + actions.length) % actions.length;
    actions[next]?.focus();
  }

  const menuId = `item-actions-${item.id}`;

  return (
    <div className="item-actions" onClick={(event) => event.stopPropagation()}>
      <button
        className="item-action copy-action"
        type="button"
        aria-label="Copy item"
        disabled={busy}
        onClick={onCopy}
      >
        Copy
      </button>
      <button
        ref={trigger}
        id={`item-actions-trigger-${item.id}`}
        className="item-action more-action"
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="item-action-menu"
          role="menu"
          aria-label="Item actions"
          onKeyDown={handleMenuKeyDown}
        >
          <button
            ref={firstAction}
            type="button"
            role="menuitem"
            onClick={() => run(onTogglePin)}
          >
            {item.pinned ? "Unpin item" : "Pin item"}
          </button>
          <button type="button" role="menuitem" onClick={() => run(onToggleFavorite)}>
            {item.favorite ? "Unfavorite item" : "Favorite item"}
          </button>
          {onEdit && (
            <button type="button" role="menuitem" onClick={() => run(onEdit)}>
              Edit item
            </button>
          )}
          {onDuplicate && (
            <button type="button" role="menuitem" onClick={() => run(onDuplicate)}>
              Duplicate item
            </button>
          )}
          {onToggleArchive && (
            <button
              type="button"
              role="menuitem"
              disabled={archiveDisabled}
              onClick={() => run(onToggleArchive)}
            >
              {item.archived_at ? "Unarchive item" : "Archive item"}
            </button>
          )}
          <button
            className="danger-action"
            type="button"
            role="menuitem"
            disabled={deleteDisabled}
            onClick={() => run(onDelete)}
          >
            Delete item
          </button>
        </div>
      )}
    </div>
  );
}
