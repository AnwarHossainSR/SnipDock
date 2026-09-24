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

const iconClass = "size-3.5 shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]";

const quickAction =
  "inline-flex h-[26px] w-7 min-h-0 cursor-pointer items-center justify-center rounded-[7px] p-0 text-[var(--text-muted)] transition-colors duration-100 hover:bg-muted hover:text-foreground aria-pressed:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass}>
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" />
      <path d="M12 14v6" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current">
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.68rem] font-medium text-foreground shadow-[var(--shadow-panel)]" role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
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
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) firstAction.current?.focus();
  }, [open]);

  // An open menu used to survive a click anywhere else on the page, leaving
  // one menu hanging over rows the user had moved on to. Closing on a press
  // outside is what every other menu on the platform does. `pointerdown`
  // rather than `click` so the menu is gone before the press lands on
  // whatever is underneath it, and focus is left where the user pressed
  // instead of being yanked back to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (container.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
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
    <div
      ref={container}
      // A small floating pill over the row's right edge, shown on hover or
      // focus. It used to sit in the row's flow, invisible but still taking
      // its width from every capture's text. An open menu pins it visible, so
      // the controls do not vanish from under the pointer on its way down.
      className={
        "absolute right-2.5 top-1/2 z-[2] flex -translate-y-1/2 items-center gap-0.5 rounded-[9px] border border-border bg-background p-0.5 shadow-[var(--shadow-panel)] " +
        "transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none " +
        "group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 " +
        (open ? "translate-x-0 opacity-100" : "translate-x-1.5 opacity-0")
      }
      onClick={(event) => event.stopPropagation()}
    >
      <Tooltip label="Copy to clipboard">
        <button
          type="button"
          className={quickAction}
          aria-label="Copy item"
          disabled={busy}
          onClick={onCopy}
        >
          <CopyIcon />
        </button>
      </Tooltip>
      <Tooltip label={item.pinned ? "Unpin" : "Pin"}>
        <button
          type="button"
          className={quickAction}
          aria-label={item.pinned ? "Unpin capture" : "Pin capture"}
          aria-pressed={item.pinned}
          disabled={busy}
          onClick={onTogglePin}
        >
          <PinIcon />
        </button>
      </Tooltip>
      <Button
        ref={trigger}
        id={`item-actions-trigger-${item.id}`}
        variant="ghost"
        size="sm"
        className={quickAction + " aria-expanded:bg-muted aria-expanded:text-foreground"}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreIcon />
      </Button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+0.35rem)] z-30 grid min-w-[10rem] origin-top-right animate-[menu-in_120ms_ease-out] rounded-[10px] border border-border bg-background p-1 shadow-[var(--shadow-menu)] motion-reduce:animate-none"
          role="menu"
          aria-label="Item actions"
          onKeyDown={handleMenuKeyDown}
        >
          <Button
            ref={firstAction}
            variant="ghost"
            className="h-auto cursor-pointer justify-start rounded-md px-2.5 py-2 text-left text-[0.78rem] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            role="menuitem"
            onClick={() => run(onTogglePin)}
          >
            {item.pinned ? "Unpin item" : "Pin item"}
          </Button>
          <Button variant="ghost" className="h-auto cursor-pointer justify-start rounded-md px-2.5 py-2 text-left text-[0.78rem] font-normal text-muted-foreground hover:bg-muted hover:text-foreground" type="button" role="menuitem" onClick={() => run(onToggleFavorite)}>
            {item.favorite ? "Unfavorite item" : "Favorite item"}
          </Button>
          {onEdit && (
            <Button variant="ghost" className="h-auto cursor-pointer justify-start rounded-md px-2.5 py-2 text-left text-[0.78rem] font-normal text-muted-foreground hover:bg-muted hover:text-foreground" type="button" role="menuitem" onClick={() => run(onEdit)}>
              Edit item
            </Button>
          )}
          {onDuplicate && (
            <Button variant="ghost" className="h-auto cursor-pointer justify-start rounded-md px-2.5 py-2 text-left text-[0.78rem] font-normal text-muted-foreground hover:bg-muted hover:text-foreground" type="button" role="menuitem" onClick={() => run(onDuplicate)}>
              Duplicate item
            </Button>
          )}
          {onToggleArchive && (
            <Button
              variant="ghost"
              className="h-auto cursor-pointer justify-start rounded-md px-2.5 py-2 text-left text-[0.78rem] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
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
            className="h-auto cursor-pointer justify-start rounded-md px-2.5 py-2 text-left text-[0.78rem] font-normal text-destructive hover:bg-muted hover:text-destructive"
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
