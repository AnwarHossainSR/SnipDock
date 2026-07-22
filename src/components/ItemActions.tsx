import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { LibraryItem } from "../api/types";
import { Button } from "@/components/ui/button";

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
    <div className="relative flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-aria-selected:opacity-100 motion-reduce:transition-none" onClick={(event) => event.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-[0.72rem] font-semibold text-muted-foreground hover:bg-accent hover:text-primary"
        type="button"
        aria-label="Copy item"
        disabled={busy}
        onClick={onCopy}
      >
        Copy
      </Button>
      <Button
        ref={trigger}
        id={`item-actions-trigger-${item.id}`}
        variant="ghost"
        size="sm"
        className="h-8 min-w-7 px-1 text-[0.72rem] font-semibold tracking-wide text-muted-foreground hover:bg-accent hover:text-primary aria-expanded:bg-accent aria-expanded:text-primary"
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">•••</span>
      </Button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+0.25rem)] z-30 grid min-w-[9.5rem] rounded-md border border-border bg-card p-1 shadow-[var(--shadow-panel)]"
          role="menu"
          aria-label="Item actions"
          onKeyDown={handleMenuKeyDown}
        >
          <Button
            ref={firstAction}
            variant="ghost"
            className="h-auto justify-start rounded-sm px-3 py-2 text-left text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            role="menuitem"
            onClick={() => run(onTogglePin)}
          >
            {item.pinned ? "Unpin item" : "Pin item"}
          </Button>
          <Button variant="ghost" className="h-auto justify-start rounded-sm px-3 py-2 text-left text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground" type="button" role="menuitem" onClick={() => run(onToggleFavorite)}>
            {item.favorite ? "Unfavorite item" : "Favorite item"}
          </Button>
          {onEdit && (
            <Button variant="ghost" className="h-auto justify-start rounded-sm px-3 py-2 text-left text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground" type="button" role="menuitem" onClick={() => run(onEdit)}>
              Edit item
            </Button>
          )}
          {onDuplicate && (
            <Button variant="ghost" className="h-auto justify-start rounded-sm px-3 py-2 text-left text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground" type="button" role="menuitem" onClick={() => run(onDuplicate)}>
              Duplicate item
            </Button>
          )}
          {onToggleArchive && (
            <Button
              variant="ghost"
              className="h-auto justify-start rounded-sm px-3 py-2 text-left text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
              type="button"
              role="menuitem"
              disabled={archiveDisabled}
              onClick={() => run(onToggleArchive)}
            >
              {item.archived_at ? "Unarchive item" : "Archive item"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-auto justify-start rounded-sm px-3 py-2 text-left text-xs font-normal text-destructive hover:bg-muted hover:text-destructive"
            type="button"
            role="menuitem"
            disabled={deleteDisabled}
            onClick={() => run(onDelete)}
          >
            Delete item
          </Button>
        </div>
      )}
    </div>
  );
}
