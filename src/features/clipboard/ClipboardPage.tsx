import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { ContentType, DeleteReceipt, LibraryItem, SearchQuery } from "../../api/types";
import ClipboardItem from "./ClipboardItem";
import UndoToast from "./UndoToast";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 30;

const clipboardQuery: SearchQuery = {
  text: null,
  kinds: ["clipboard"],
  content_types: [],
  languages: [],
  project_ids: [],
  category_ids: [],
  tag_ids: [],
  pinned: null,
  favorite: null,
  created_from: null,
  created_to: null,
  sort: "newest",
  limit: PAGE_SIZE,
  offset: 0,
};

type ClipboardFilter = "all" | "code" | "pinned" | "favorite";
const codeTypes: ContentType[] = ["code", "json", "sql", "html", "css", "xml", "shell", "markdown", "config"];

function queryFor(filter: ClipboardFilter): SearchQuery {
  return {
    ...clipboardQuery,
    content_types: filter === "code" ? codeTypes : [],
    pinned: filter === "pinned" ? true : null,
    favorite: filter === "favorite" ? true : null,
  };
}

type HistoryState =
  | { status: "loading"; items: LibraryItem[]; total: number }
  | { status: "ready"; items: LibraryItem[]; total: number }
  | { status: "error"; items: LibraryItem[]; total: number };

function ContentState({ status }: { status: "loading" | "empty" | "error" }) {
  if (status === "loading") {
    return (
      <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground max-[31rem]:flex-col max-[31rem]:p-6 max-[31rem]:text-center" role="status" aria-busy="true">
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" />
        <p>Loading history…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground max-[31rem]:flex-col max-[31rem]:p-6 max-[31rem]:text-center" role="alert">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 font-bold text-destructive" aria-hidden="true">
          !
        </span>
        <div>
          <h3 className="m-0 text-base font-semibold text-foreground">Clipboard history unavailable</h3>
          <p className="mt-2 text-sm leading-relaxed">Close and reopen SnipDock to try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground max-[31rem]:flex-col max-[31rem]:p-6 max-[31rem]:text-center" role="status">
      <span className="relative block size-14 shrink-0 -rotate-6 rounded-md border border-primary/25 bg-accent" aria-hidden="true">
        <span className="absolute inset-[0.65rem_-0.45rem_-0.45rem_0.65rem] rounded-md border border-primary" />
      </span>
      <div>
        <h3 className="m-0 text-base font-semibold text-foreground">Your clipboard is quiet</h3>
        <p className="mt-2 text-sm leading-relaxed">Copy text and it will appear here, ready when you need it.</p>
      </div>
    </div>
  );
}

const actionIcon = "size-4 shrink-0";

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${actionIcon} fill-current`}>
      <rect x="7" y="5" width="3.4" height="14" rx="1.1" />
      <rect x="13.6" y="5" width="3.4" height="14" rx="1.1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${actionIcon} fill-current`}>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${actionIcon} fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]`}
    >
      <path d="M5 7h14M10 4h4M9 7v11m6-11v11M7 7l.8 12a1.2 1.2 0 0 0 1.2 1.1h6a1.2 1.2 0 0 0 1.2-1.1L17 7" />
    </svg>
  );
}

export default function ClipboardPage({
  trackingPaused = false,
}: {
  trackingPaused?: boolean;
}) {
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    items: [],
    total: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClipboardFilter>("all");
  const [paused, setPaused] = useState(trackingPaused);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [includePinned, setIncludePinned] = useState(false);
  const [includeFavorite, setIncludeFavorite] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoReceipt, setUndoReceipt] = useState<DeleteReceipt | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const clearTrigger = useRef<HTMLButtonElement>(null);
  const confirmDialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const sentinel = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const loadHistory = useCallback(async () => {
    const id = ++requestId.current;
    const result = await commands.searchItems(queryFor(filter));
    if (id !== requestId.current) return;
    setHistory({ status: "ready", items: result.items, total: result.total });
    setSelectedId((current) => result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? null));
  }, [filter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || history.status !== "ready") return;
    if (history.items.length >= history.total) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const result = await commands.searchItems({
        ...queryFor(filter),
        offset: history.items.length,
      });
      if (id !== requestId.current) return;
      setHistory((current) =>
        current.status === "ready"
          ? {
              ...current,
              total: result.total,
              items: [
                ...current.items,
                ...result.items.filter(
                  (next) => !current.items.some((item) => item.id === next.id),
                ),
              ],
            }
          : current,
      );
    } catch {
      setActionError("Could not load more clipboard items.");
    } finally {
      setLoadingMore(false);
    }
  }, [filter, history.status, history.items, history.total, loadingMore]);

  useEffect(() => {
    let active = true;

    setHistory((current) => ({ ...current, status: "loading" }));
    loadHistory().then(
      () => {},
      () => {
        if (active) setHistory({ status: "error", items: [], total: 0 });
      },
    );

    return () => {
      active = false;
    };
  }, [loadHistory]);

  useEffect(() => {
    let active = true;
    void commands.getSettings().then(
      (settings) => {
        if (active && typeof settings.clipboard_tracking === "boolean") {
          setPaused(!settings.clipboard_tracking);
        }
      },
      () => {
        if (active) setActionError("Could not read clipboard tracking status.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listenEvent<LibraryItem>("clipboard://captured", () => {
      void loadHistory();
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch(() => {
      if (active) setActionError("Live clipboard updates unavailable. Restart SnipDock to try again.");
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [loadHistory]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  function selectByKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
    currentIndex: number,
  ) {
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, history.items.length - 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = history.items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextItem = history.items[nextIndex];
    if (!nextItem) return;
    setSelectedId(nextItem.id);
    itemRefs.current.get(nextItem.id)?.focus();
  }

  async function runItemAction<T>(
    id: string,
    command: () => Promise<T>,
    apply: (result: T) => void,
  ) {
    setBusyId(id);
    setActionError("");
    try {
      apply(await command());
    } catch {
      setActionError("Could not update this clipboard item.");
    } finally {
      setBusyId(null);
    }
  }

  function replaceItem(updated: LibraryItem) {
    setHistory((current) =>
      current.status === "ready"
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          }
        : current,
    );
  }

  function copyItem(item: LibraryItem) {
    void runItemAction(
      item.id,
      () => commands.copyItem(item.id, "raw"),
      () => setActionMessage("Copied to clipboard"),
    );
  }

  function togglePin(item: LibraryItem) {
    void runItemAction(
      item.id,
      () =>
        commands.setItemFlags(item.id, {
          pinned: !item.pinned,
          favorite: null,
          archived: null,
        }),
      replaceItem,
    );
  }

  function toggleFavorite(item: LibraryItem) {
    void runItemAction(
      item.id,
      () =>
        commands.setItemFlags(item.id, {
          pinned: null,
          favorite: !item.favorite,
          archived: null,
        }),
      replaceItem,
    );
  }

  function deleteItem(item: LibraryItem) {
    if (busyId || clearBusy) return;
    void runItemAction(item.id, () => commands.deleteItem(item.id), (receipt) => {
      const remaining = history.items.filter((entry) => entry.id !== item.id);
      setHistory((current) =>
        current.status === "ready"
          ? {
              ...current,
              items: current.items.filter((entry) => entry.id !== item.id),
              total: Math.max(0, current.total - 1),
            }
          : current,
      );
      setSelectedId((current) =>
        current === item.id ? (remaining[0]?.id ?? null) : current,
      );
      setUndoReceipt(receipt);
    });
  }

  async function clearHistory() {
    if (undoReceipt || busyId || clearBusy) return;
    setClearBusy(true);
    confirmDialog.current?.focus();
    setActionError("");
    try {
      const receipt = await commands.clearClipboardHistoryWithOptions(!includePinned, !includeFavorite);
      setHistory((current) =>
        current.status === "ready"
          ? { ...current, items: [], total: 0 }
          : current,
      );
      setSelectedId(null);
      setUndoReceipt(receipt);
      heading.current?.focus();
      setConfirmClear(false);
      setIncludePinned(false);
      setIncludeFavorite(false);
      await loadHistory();
    } catch {
      setActionError("Could not clear clipboard history.");
    } finally {
      setClearBusy(false);
    }
  }

  function closeClearDialog() {
    clearTrigger.current?.focus();
    setConfirmClear(false);
  }

  function handleConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !clearBusy) {
      event.preventDefault();
      closeClearDialog();
      return;
    }
    if (event.key !== "Tab") return;

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    if (
      (!event.shiftKey && document.activeElement === last) ||
      (event.shiftKey && document.activeElement === first)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }

  async function undoDelete() {
    if (!undoReceipt) return;
    setUndoBusy(true);
    setActionError("");
    try {
      await commands.restoreItem(undoReceipt.id);
      await loadHistory();
      setActionMessage(
        `${undoReceipt.item_count} ${undoReceipt.item_count === 1 ? "item" : "items"} restored`,
      );
      setUndoReceipt(null);
    } catch {
      setActionError("Undo expired or could not be completed.");
      setUndoReceipt(null);
    } finally {
      setUndoBusy(false);
    }
  }

  async function toggleTracking() {
    setTrackingBusy(true);
    setActionError("");
    try {
      const nextEnabled = paused;
      const enabled = await commands.setClipboardTracking(nextEnabled);
      setPaused(!enabled);
    } catch {
      setActionError("Could not change clipboard tracking.");
    } finally {
      setTrackingBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    let unlisten: (() => void)[] = [];

    const selectedItem = () => history.items.find((item) => item.id === selectedId);
    const runSelected = (action: (item: LibraryItem) => void) => {
      if (busyId || clearBusy) return;
      const item = selectedItem();
      if (item) action(item);
    };
    const moveSelection = (offset: -1 | 1) => {
      if (!history.items.length) return;
      const current = history.items.findIndex((item) => item.id === selectedId);
      const next = current < 0
        ? 0
        : Math.max(0, Math.min(current + offset, history.items.length - 1));
      const item = history.items[next];
      if (!item) return;
      setSelectedId(item.id);
      requestAnimationFrame(() => itemRefs.current.get(item.id)?.focus());
    };

    void Promise.all([
      listenEvent<void>(ShortcutEvents.copySelected, () => runSelected(copyItem)),
      listenEvent<void>(ShortcutEvents.togglePin, () => runSelected(togglePin)),
      listenEvent<void>(ShortcutEvents.toggleFavorite, () => runSelected(toggleFavorite)),
      listenEvent<void>(ShortcutEvents.deleteSelected, () => runSelected(deleteItem)),
      listenEvent<void>(ShortcutEvents.navigateNext, () => moveSelection(1)),
      listenEvent<void>(ShortcutEvents.navigatePrevious, () => moveSelection(-1)),
    ]).then((stops) => {
      if (active) unlisten = stops;
      else stops.forEach((stop) => stop());
    }).catch(() => {
      if (active) setActionError("Clipboard shortcuts unavailable. Restart SnipDock to try again.");
    });

    return () => {
      active = false;
      unlisten.forEach((stop) => stop());
    };
  }, [busyId, clearBusy, history.items, selectedId]);

  const hasItems = history.status === "ready" && history.items.length > 0;
  const hasMore = history.status === "ready" && history.items.length < history.total;
  const destructiveBusy = busyId !== null || clearBusy;

  return (
    <main className="min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4 max-[31rem]:flex-col max-[31rem]:items-start">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Clipboard history</p>
          <h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" ref={heading} id="workspace-title" tabIndex={-1}>Recent captures</h2>
        </div>
        <div className="flex items-center gap-2 max-[31rem]:gap-1">
          <span
            className={paused ? "inline-flex items-center text-muted-foreground" : "inline-flex items-center text-[var(--color-positive)]"}
            title={paused ? "Tracking paused" : "Tracking active"}
          >
            <span className="size-[0.5rem] rounded-full bg-current shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_16%,transparent)]" aria-hidden="true" />
            <span className="sr-only">{paused ? "Tracking paused" : "Tracking active"}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="grid size-8 min-h-0 place-items-center p-0 text-muted-foreground hover:bg-accent hover:text-primary"
            type="button"
            disabled={trackingBusy}
            aria-label={paused ? "Resume tracking" : "Pause tracking"}
            title={paused ? "Resume tracking" : "Pause tracking"}
            onClick={() => void toggleTracking()}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </Button>
          <Button
            ref={clearTrigger}
            variant="ghost"
            size="sm"
            className="grid size-8 min-h-0 place-items-center p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={!hasItems || destructiveBusy}
            aria-label="Clear history"
            title="Clear history"
            onClick={() => setConfirmClear(true)}
          >
            <TrashIcon />
          </Button>
          <span className="ml-1 text-xs text-muted-foreground">
            {history.total} {history.total === 1 ? "item" : "items"}
          </span>
        </div>
      </header>
      {confirmClear && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-5 backdrop-blur-sm">
          <div
            ref={confirmDialog}
            className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            tabIndex={-1}
            onKeyDown={handleConfirmKeyDown}
          >
            <h3 className="m-0 font-semibold" id="clear-history-title">Clear clipboard history?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {includePinned && includeFavorite
                ? "All clipboard history including pinned and favorite items will be removed for 30 seconds."
                : "All clipboard history except pinned and favorite items will be removed for 30 seconds."}
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePinned}
                  onChange={(e) => setIncludePinned(e.target.checked)}
                  disabled={clearBusy}
                  className="size-4 rounded border border-input"
                />
                <span className="text-sm">Also delete pinned items</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFavorite}
                  onChange={(e) => setIncludeFavorite(e.target.checked)}
                  disabled={clearBusy}
                  className="size-4 rounded border border-input"
                />
                <span className="text-sm">Also delete favorite items</span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" type="button" disabled={clearBusy} autoFocus onClick={closeClearDialog}>
                Cancel
              </Button>
              <Button variant="destructive" type="button" disabled={clearBusy} onClick={() => void clearHistory()}>
                {clearBusy ? "Clearing…" : "Clear history"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {actionMessage}
      </div>
      {actionError && (
        <p className="-mt-3 mb-4 text-xs text-destructive" role="alert">
          {actionError}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Clipboard filters">
        {(["all", "code", "pinned", "favorite"] as const).map((value) => (
          <Button className="h-[1.9rem] px-3 text-xs aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary" variant="outline" size="sm" type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>
            {value === "all" ? "All" : value === "favorite" ? "Favorites" : value[0].toUpperCase() + value.slice(1)}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{history.total} filtered</span>
      </div>
      <section
        className={hasItems ? "grid min-h-[min(31rem,calc(100vh-11rem))] place-items-stretch overflow-hidden rounded-lg border border-border bg-card max-[31rem]:min-h-[calc(100vh-9rem)]" : "grid min-h-[min(31rem,calc(100vh-11rem))] place-items-center overflow-hidden rounded-lg border border-border bg-card max-[31rem]:min-h-[calc(100vh-9rem)]"}
        aria-label="Recent clipboard items"
      >
        {history.status === "loading" && <ContentState status="loading" />}
        {history.status === "error" && <ContentState status="error" />}
        {history.status === "ready" && history.items.length === 0 && filter === "all" && (
          <ContentState status="empty" />
        )}
        {history.status === "ready" && history.items.length === 0 && filter !== "all" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status"><div><h3 className="m-0 text-base font-semibold text-foreground">No matching captures</h3><p className="mt-2 text-sm">Try another filter.</p><Button variant="outline" type="button" onClick={() => setFilter("all")}>Clear filter</Button></div></div>}
        {hasItems && (
          <div className="flex w-full min-w-0 flex-col self-start">
            <div className="w-full min-w-0 p-3" role="listbox" aria-label="Clipboard history">
              {history.items.map((item, index) => (
                <ClipboardItem
                  ref={(element) => {
                    if (element) itemRefs.current.set(item.id, element);
                    else itemRefs.current.delete(item.id);
                  }}
                  item={item}
                  selected={item.id === selectedId}
                  busy={item.id === busyId}
                  deleteDisabled={destructiveBusy}
                  onSelect={() => setSelectedId(item.id)}
                  onKeyDown={(event) => selectByKeyboard(event, index)}
                  onCopy={() => copyItem(item)}
                  onTogglePin={() => togglePin(item)}
                  onToggleFavorite={() => toggleFavorite(item)}
                  onDelete={() => deleteItem(item)}
                  key={item.id}
                />
              ))}
            </div>
            {hasMore && (
              <div
                ref={sentinel}
                className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {loadingMore && (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" />
                    Loading more…
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      {undoReceipt && (
        <UndoToast
          receipt={undoReceipt}
          busy={undoBusy}
          onUndo={() => void undoDelete()}
          onDismiss={() => setUndoReceipt(null)}
        />
      )}
    </main>
  );
}
