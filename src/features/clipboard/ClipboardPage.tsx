import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { DeleteReceipt, LibraryItem } from "../../api/types";
import ClipboardItem from "./ClipboardItem";
import UndoToast from "./UndoToast";
import { Button } from "@/components/ui/button";
import { useClipboardStore } from "../../stores/clipboardStore";
import { useClipboardActions } from "../../hooks/useClipboardActions";
import { useClearDialog } from "../../hooks/useClearDialog";

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
  onTrackingChanged,
}: {
  trackingPaused?: boolean;
  onTrackingChanged?: (paused: boolean) => void;
}) {
  const [paused, setPaused] = useState(trackingPaused);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoReceipt, setUndoReceipt] = useState<DeleteReceipt | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const sentinel = useRef<HTMLDivElement>(null);

  const {
    items: historyItems,
    total: historyTotal,
    status: historyStatus,
    loadingMore,
    filter,
    selectedIds,
    multiSelectMode,
    loadHistory,
    loadMore,
    setFilter,
    replaceItem,
    removeItem,
    removeItems,
    toggleItemSelect,
    selectSingle,
    selectAll,
    clearSelection,
  } = useClipboardStore();

  const actionCallbacks = useMemo(
    () => ({
      onReplaceItem: replaceItem,
      onRemoveItem: removeItem,
      onRemoveItems: removeItems,
      onSetUndoReceipt: setUndoReceipt,
      onSetActionMessage: setActionMessage,
      onSetActionError: setActionError,
    }),
    [replaceItem, removeItem, removeItems],
  );

  const {
    busyId,
    deleteSelectedBusy,
    copyItem,
    togglePin,
    toggleFavorite,
    deleteItem,
    deleteSelectedItems,
  } = useClipboardActions(actionCallbacks);

  const clearDialogCallbacks = useMemo(
    () => ({
      onClearSuccess: setUndoReceipt,
      onClearItems: clearSelection,
      onSetActionError: setActionError,
      onReload: loadHistory,
      onFocusHeading: () => heading.current?.focus(),
    }),
    [clearSelection, loadHistory],
  );

  const {
    confirmClear,
    setConfirmClear,
    includePinned,
    setIncludePinned,
    includeFavorite,
    setIncludeFavorite,
    clearBusy,
    clearHistory,
    closeClearDialog,
    handleConfirmKeyDown,
    clearTrigger,
    confirmDialog,
  } = useClearDialog(clearDialogCallbacks);

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
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listenEvent<LibraryItem>("clipboard://captured", () => {
      loadHistory();
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

  const shortcutState = useRef({
    busyId,
    clearBusy,
    deleteSelectedBusy,
    historyItems,
    selectedIds,
    copyItem,
    togglePin,
    toggleFavorite,
    deleteItem,
    deleteSelectedItems,
    selectSingle,
  });
  useEffect(() => {
    shortcutState.current = {
      busyId,
      clearBusy,
      deleteSelectedBusy,
      historyItems,
      selectedIds,
      copyItem,
      togglePin,
      toggleFavorite,
      deleteItem,
      deleteSelectedItems,
      selectSingle,
    };
  });

  useEffect(() => {
    let active = true;
    let unlisten: (() => void)[] = [];

    const selectedItems = () => {
      const { historyItems, selectedIds } = shortcutState.current;
      if (selectedIds.size === 0) return [];
      return historyItems.filter((item) => selectedIds.has(item.id));
    };
    const runSelected = (action: (item: LibraryItem) => void) => {
      const { busyId, clearBusy, deleteSelectedBusy } = shortcutState.current;
      if (busyId || clearBusy || deleteSelectedBusy) return;
      const items = selectedItems();
      if (items.length === 1) action(items[0]);
    };
    const moveSelection = (offset: -1 | 1) => {
      const { historyItems, selectedIds, selectSingle } = shortcutState.current;
      if (!historyItems.length) return;
      const lastSelected = selectedIds.size > 0
        ? historyItems.findIndex((item) => item.id === [...selectedIds].at(-1))
        : -1;
      const current = lastSelected < 0 ? 0 : lastSelected;
      const next = Math.max(0, Math.min(current + offset, historyItems.length - 1));
      const item = historyItems[next];
      if (!item) return;
      selectSingle(item.id);
      setActiveId(item.id);
      requestAnimationFrame(() => itemRefs.current.get(item.id)?.focus());
    };

    void Promise.all([
      listenEvent<void>(ShortcutEvents.copySelected, () => runSelected(shortcutState.current.copyItem)),
      listenEvent<void>(ShortcutEvents.togglePin, () => runSelected(shortcutState.current.togglePin)),
      listenEvent<void>(ShortcutEvents.toggleFavorite, () => runSelected(shortcutState.current.toggleFavorite)),
      listenEvent<void>(ShortcutEvents.deleteSelected, () => {
        const { selectedIds, deleteSelectedItems, deleteItem } = shortcutState.current;
        if (selectedIds.size > 1) {
          void deleteSelectedItems(selectedIds);
        } else {
          runSelected(deleteItem);
        }
      }),
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
  }, []);

  async function undoDelete() {
    if (!undoReceipt) return;
    setUndoBusy(true);
    setActionError("");
    try {
      await commands.restoreItem(undoReceipt.id);
      loadHistory();
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
      onTrackingChanged?.(!enabled);
    } catch {
      setActionError("Could not change clipboard tracking.");
    } finally {
      setTrackingBusy(false);
    }
  }

  function handleKeyboardNav(
    event: KeyboardEvent<HTMLDivElement>,
    currentIndex: number,
    onDeleteSelected: () => void,
  ) {
    if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      selectAll();
      return true;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedIds.size > 0
    ) {
      event.preventDefault();
      onDeleteSelected();
      return true;
    }
    if (event.key === "Escape" && selectedIds.size > 0) {
      event.preventDefault();
      clearSelection();
      return true;
    }
    if (event.key === " " && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const item = historyItems[currentIndex];
      if (item) toggleItemSelect(item.id);
      return true;
    }
    return false;
  }

  function selectByKeyboard(event: KeyboardEvent<HTMLDivElement>, currentIndex: number) {
    const handled = handleKeyboardNav(event, currentIndex, () => void deleteSelectedItems(selectedIds));
    if (handled) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, historyItems.length - 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = historyItems.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextItem = historyItems[nextIndex];
    if (!nextItem) return;
    if (event.shiftKey && multiSelectMode) {
      toggleItemSelect(nextItem.id);
    } else {
      selectSingle(nextItem.id);
    }
    setActiveId(nextItem.id);
    itemRefs.current.get(nextItem.id)?.focus();
  }

  const hasItems = historyStatus === "ready" && historyItems.length > 0;
  const hasMore = historyStatus === "ready" && historyItems.length < historyTotal;
  const destructiveBusy = busyId !== null || clearBusy || deleteSelectedBusy;
  const hasSelection = selectedIds.size > 0;

  return (
    <main className="min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4 max-[31rem]:flex-col max-[31rem]:items-start">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Clipboard history</p>
          <h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" ref={heading} id="workspace-title" tabIndex={-1}>Recent captures</h2>
        </div>
        <div className="flex items-center gap-2 max-[31rem]:gap-1">
          {hasSelection && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                type="button"
                disabled={destructiveBusy}
                onClick={() => void deleteSelectedItems(selectedIds)}
              >
                {deleteSelectedBusy ? "Deleting…" : `Delete ${selectedIds.size} ${selectedIds.size === 1 ? "item" : "items"}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-primary"
                type="button"
                onClick={clearSelection}
              >
                Clear selection
              </Button>
              <div className="w-px h-4 bg-border" />
            </>
          )}
          {!hasSelection && multiSelectMode && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-primary"
                type="button"
                onClick={selectAll}
              >
                Select all
              </Button>
              <div className="w-px h-4 bg-border" />
            </>
          )}
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
            {historyTotal} {historyTotal === 1 ? "item" : "items"}
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
                : includePinned
                  ? "All clipboard history except favorite items will be removed for 30 seconds."
                  : includeFavorite
                    ? "All clipboard history except pinned items will be removed for 30 seconds."
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
        <span className="ml-auto text-xs text-muted-foreground">{historyTotal} filtered</span>
      </div>
      <section
        className={hasItems ? "grid min-h-[min(31rem,calc(100vh-11rem))] place-items-stretch overflow-hidden rounded-lg border border-border bg-card max-[31rem]:min-h-[calc(100vh-9rem)]" : "grid min-h-[min(31rem,calc(100vh-11rem))] place-items-center overflow-hidden rounded-lg border border-border bg-card max-[31rem]:min-h-[calc(100vh-9rem)]"}
        aria-label="Recent clipboard items"
      >
        {historyStatus === "loading" && <ContentState status="loading" />}
        {historyStatus === "error" && <ContentState status="error" />}
        {historyStatus === "ready" && historyItems.length === 0 && filter === "all" && (
          <ContentState status="empty" />
        )}
        {historyStatus === "ready" && historyItems.length === 0 && filter !== "all" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status"><div><h3 className="m-0 text-base font-semibold text-foreground">No matching captures</h3><p className="mt-2 text-sm">Try another filter.</p><Button variant="outline" type="button" onClick={() => setFilter("all")}>Clear filter</Button></div></div>}
        {hasItems && (
          <div className="flex w-full min-w-0 flex-col self-start">
            <div
              className="w-full min-w-0 p-3"
              role="listbox"
              aria-label="Clipboard history"
              aria-multiselectable={multiSelectMode}
            >
              {(() => {
                const effectiveActiveId = activeId && historyItems.some((i) => i.id === activeId)
                  ? activeId
                  : (selectedIds.size > 0 ? [...selectedIds][0] : historyItems[0]?.id);
                return historyItems.map((item, index) => (
                <ClipboardItem
                  ref={(element) => {
                    if (element) itemRefs.current.set(item.id, element);
                    else itemRefs.current.delete(item.id);
                  }}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  active={item.id === effectiveActiveId}
                  busy={item.id === busyId}
                  deleteDisabled={destructiveBusy}
                  onSelect={() => {
                    selectSingle(item.id);
                    setActiveId(item.id);
                  }}
                  onKeyDown={(event) => selectByKeyboard(event, index)}
                  onCopy={() => copyItem(item)}
                  onTogglePin={() => togglePin(item)}
                  onToggleFavorite={() => toggleFavorite(item)}
                  onDelete={() => deleteItem(item)}
                  multiSelect={multiSelectMode}
                  onToggleSelect={() => {
                    toggleItemSelect(item.id);
                    setActiveId(item.id);
                  }}
                  key={item.id}
                />
                ));
              })()}
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
