import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { commands } from "../../api/commands";
import type { LibraryItem, SearchQuery } from "../../api/types";
import { SourceAppList } from "../../features/clipboard/SourceAppList";
import { contentTypeTokenName } from "../../lib/contentTypeColors";
import { clipboardQuery } from "../../lib/searchQuery";
import { useClipboardStore } from "../../stores/clipboardStore";
import { useCapability } from "../../stores/platformStore";
import { cn } from "@/lib/utils";
import LibraryLists from "./LibraryLists";
import SmartFolderList from "./SmartFolderList";

const PINNED_LIMIT = 8;
function pinnedQuery(): SearchQuery {
  return clipboardQuery({ pinned: true, limit: PINNED_LIMIT });
}

const sectionHeading =
  "flex items-center gap-2 px-3 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]";

/**
 * The library - pinned captures, sources, saved searches, tags and projects -
 * behind one "Library" entry in the top bar.
 *
 * It used to fill the sidebar, which Paper Desk does not have. Everything the
 * sidebar listed is here, in the same components; what changed is that it
 * waits to be asked for, so the desk shows captures rather than their index.
 *
 * A disclosure, not a modal: the button says whether it is open, the panel
 * follows it in the tab order, and Escape or a click elsewhere closes it and
 * hands focus back. Choosing anything in it - a pinned capture, a source, a
 * saved search, a tag - is a request to see the desk, so it closes and
 * `onNavigate` brings the desk forward.
 */
export default function LibraryMenu({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<LibraryItem[]>([]);
  const sourceAppDetection = useCapability("source_app_detection");
  const setSourceApps = useClipboardStore((state) => state.setSourceApps);
  const activeSourceApps = useClipboardStore((state) => state.sourceApps);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    function refreshPinned() {
      void commands.searchItems(pinnedQuery()).then(
        (result) => { if (active) setPinnedItems(result?.items ?? []); },
        () => {},
      );
    }
    refreshPinned();
    // Pin/unpin happens on the desk via the shared store; a library change is
    // the signal to re-fetch rather than duplicating pin-tracking here.
    const unsubscribe = useClipboardStore.subscribe((state) => state.libraryRevision, refreshPinned);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close(true);
  }

  // Every control in the panel either opens a view or reveals a capture, so
  // any of them is the moment to put the desk on screen.
  function onPanelClick(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target as HTMLElement).closest("button")) return;
    close(false);
    onNavigate();
  }

  return (
    <div ref={root} className="relative flex">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "inline-flex h-full min-h-0 items-center gap-1.5 border-b-2 px-0.5 text-[0.875rem] transition-colors duration-100",
          open ? "border-[var(--accent)] font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        Library
        <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2.2] transition-transform", open && "rotate-180")}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {/* Kept mounted, only hidden, so the lists keep what they have fetched
          and opening the panel does not refetch four collections. */}
      <div
        ref={panel}
        id={id}
        role="region"
        aria-label="Library"
        hidden={!open}
        onKeyDown={onPanelKeyDown}
        onClick={onPanelClick}
        data-testid="library-panel"
        className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-[min(34rem,calc(100vh-7rem))] w-[20rem] origin-top-left animate-[menu-in_120ms_ease-out] overflow-y-auto overscroll-contain rounded-[14px] border border-border bg-card px-2 pb-3 pt-2 shadow-[var(--shadow-menu)] motion-reduce:animate-none max-[26rem]:w-[calc(100vw-1.5rem)]"
      >
        <div className="mt-2 grid min-w-0 gap-1">
          <p className={sectionHeading}>
            Pinned
            {pinnedItems.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 font-mono text-[0.6rem] tabular-nums text-muted-foreground">
                {pinnedItems.length}
              </span>
            )}
          </p>
          {pinnedItems.length === 0 ? (
            <p className="px-3 text-xs leading-relaxed text-muted-foreground">
              Pin a capture to keep it one click away.
            </p>
          ) : (
            <ul className="grid min-w-0 gap-0.5">
              {pinnedItems.map((item) => (
                <li key={item.id} className="min-w-0">
                  <button
                    type="button"
                    // The desk owns selection and scrolling, so this only
                    // records which capture to reveal.
                    onClick={() => useClipboardStore.getState().requestFocusItem(item.id)}
                    className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={item.content_type === "image" ? "Pinned image" : item.content.slice(0, 200)}
                  >
                    <span
                      aria-hidden="true"
                      className="size-[0.4rem] shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--type-${contentTypeTokenName(item.content_type)})` }}
                    />
                    <span className={cn("min-w-0 flex-1 truncate", item.content_type !== "image" && "font-mono text-[0.7rem]")}>
                      {item.content_type === "image" ? "Image" : item.content.replace(/\s+/g, " ").trim().slice(0, 60) || "Empty"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Every capture would be filed under "unknown" on a platform that
            cannot name the foreground app, so sources are not offered there. */}
        {sourceAppDetection && (
          <div className="mt-5 grid min-w-0 gap-1">
            <p className={sectionHeading}>Sources</p>
            <SourceAppList
              active={activeSourceApps}
              onSelect={(value) => setSourceApps(value === null ? null : [value])}
            />
          </div>
        )}

        <SmartFolderList />
        <LibraryLists />
      </div>
    </div>
  );
}
