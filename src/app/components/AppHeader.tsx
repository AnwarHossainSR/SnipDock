import type { MouseEvent } from "react";
import { useClipboardStore } from "../../stores/clipboardStore";
import { cn } from "@/lib/utils";
import CapturePill from "./CapturePill";
import LibraryMenu from "./LibraryMenu";

const navLink =
  "inline-flex h-full items-center border-b-2 px-0.5 text-[0.875rem] no-underline transition-colors duration-100";
const navActive = "border-[var(--accent)] font-semibold text-foreground";
const navIdle = "border-transparent text-muted-foreground hover:text-foreground";

/**
 * The Paper Desk top bar: the wordmark, where you can go, and the two things
 * you can do from anywhere - pause capture and save an item.
 *
 * "Desk" and "Pinned" are both the history. Pinned is the desk narrowed to
 * what was pinned, which is how people use it, so it is a destination here
 * rather than a filter pill they have to find.
 */
export default function AppHeader({
  page,
  trackingPaused,
  trackingBusy,
  storageFull,
  onToggleTracking,
  onShowDesk,
  onSaveItem,
}: {
  page: "clipboard" | "settings";
  trackingPaused: boolean;
  trackingBusy?: boolean;
  storageFull?: boolean;
  onToggleTracking: () => void;
  /** Bring the desk on screen, leaving any search. */
  onShowDesk: () => void;
  onSaveItem: () => void;
}) {
  const filter = useClipboardStore((state) => state.filter);
  const savedSearch = useClipboardStore((state) => state.savedSearch);
  const onDesk = page === "clipboard";
  const pinnedActive = onDesk && filter === "pinned" && !savedSearch;

  function showDesk(event: MouseEvent<HTMLAnchorElement>, pinned: boolean) {
    event.preventDefault();
    const { setFilter, filter: current, savedSearch: folder } = useClipboardStore.getState();
    if (pinned) {
      if (current !== "pinned" || folder) setFilter("pinned");
    } else if (current === "pinned") {
      setFilter("all");
    }
    onShowDesk();
  }

  return (
    <header className="flex h-[60px] shrink-0 items-stretch gap-8 border-b border-border px-8 max-[56rem]:gap-5 max-[56rem]:px-5 max-[40rem]:gap-3 max-[40rem]:px-3">
      <a
        href="#clipboard"
        onClick={(event) => showDesk(event, false)}
        aria-label="SnipDock home"
        className="flex shrink-0 items-center gap-2.5 no-underline"
      >
        <span
          aria-hidden="true"
          className="grid size-[30px] place-items-center rounded-lg bg-foreground font-display text-[1.05rem] italic text-background"
        >
          S
        </span>
        <h1 className="m-0 font-display text-[1.28rem] font-semibold tracking-[-0.01em] max-[40rem]:sr-only">SnipDock</h1>
      </a>

      <nav aria-label="Primary" className="flex min-w-0 items-stretch gap-6 max-[56rem]:gap-4">
        <a
          href="#clipboard"
          aria-current={onDesk && !pinnedActive ? "page" : undefined}
          onClick={(event) => showDesk(event, false)}
          className={cn(navLink, onDesk && !pinnedActive ? navActive : navIdle)}
        >
          Desk
        </a>
        <a
          href="#clipboard"
          aria-current={pinnedActive ? "page" : undefined}
          onClick={(event) => showDesk(event, true)}
          className={cn(navLink, pinnedActive ? navActive : navIdle)}
        >
          Pinned
        </a>
        <LibraryMenu onNavigate={onShowDesk} />
        {/* On the plan, not built: shown so the library has a place, and
            disabled so nothing pretends it is there yet. */}
        <span
          aria-disabled="true"
          className={cn(navLink, "gap-1.5 border-transparent text-[var(--text-muted)] max-[48rem]:hidden")}
        >
          Snippets
          <span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-[0.56rem] font-bold uppercase tracking-[0.06em]">
            Soon
          </span>
        </span>
        <a
          href="#settings"
          aria-current={page === "settings" ? "page" : undefined}
          className={cn(navLink, page === "settings" ? navActive : navIdle)}
        >
          Settings
        </a>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <CapturePill
          paused={trackingPaused}
          busy={trackingBusy}
          storageFull={storageFull}
          onToggle={onToggleTracking}
        />
        <button
          type="button"
          onClick={onSaveItem}
          className="inline-flex h-[38px] items-center gap-2 rounded-[10px] bg-foreground px-4 text-[0.84rem] font-semibold text-background shadow-[0_1px_2px_rgb(0_0_0/14%)] transition-opacity duration-100 hover:opacity-90 max-[40rem]:px-3"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[15px] fill-none stroke-current [stroke-linecap:round] [stroke-width:2.2]">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="max-[40rem]:sr-only">Save item</span>
        </button>
      </div>
    </header>
  );
}
