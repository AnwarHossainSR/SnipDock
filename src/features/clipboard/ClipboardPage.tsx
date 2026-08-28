import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { DeleteReceipt, GroupBy, LibraryItem, PasteFormat } from "../../api/types";
import ClipboardItem from "./ClipboardItem";
import ItemInspector from "./ItemInspector";
import SaveItemDialog from "./SaveItemDialog";
import UndoToast from "./UndoToast";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { RadioCard, SegmentedRadio } from "@/components/ui/radio-group";
import { CheckboxField } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { matchesFilter, PAGE_SIZES, useClipboardStore } from "../../stores/clipboardStore";
import ImageBulkBar from "./ImageBulkBar";
import SavedSearchBar from "./SavedSearchBar";
import { useClipboardActions } from "../../hooks/useClipboardActions";
import { useClearDialog } from "../../hooks/useClearDialog";
import type { ClearAge, ClearScope } from "../../hooks/useClearDialog";
import { getDensity } from "../../lib/density";
import { clipboardShortcutHints } from "../../lib/shortcutHints";

function ContentState({
  status,
  onRetry,
  retrying,
}: {
  status: "loading" | "empty" | "error";
  onRetry?: () => void;
  retrying?: boolean;
}) {
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
          {/* A read that fails at launch is usually a slow start rather than a
              broken database, so retrying in place beats restarting the app. */}
          <p className="mt-2 text-sm leading-relaxed">This usually clears on its own. Try again.</p>
          {onRetry && (
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              type="button"
              disabled={retrying}
              onClick={onRetry}
            >
              {retrying ? "Trying…" : "Try again"}
            </Button>
          )}
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

// One recipe for both segmented groups (filter, grouping) so the two cannot
// drift apart. `group` is what lets an active segment tint its own icon.
const segmentedTrack =
  "flex items-center gap-0.5 rounded-md bg-muted/50 p-1 ring-1 ring-inset ring-border/60";
const segmentedItem =
  "group h-8 gap-1.5 rounded-sm px-2.5 text-xs font-semibold text-muted-foreground transition-[background-color,color,box-shadow] hover:bg-card/70 hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[var(--shadow-panel)] aria-pressed:ring-1 aria-pressed:ring-primary/25";

const filterIcon = "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]";

function AllIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(filterIcon, className)}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(filterIcon, className)}>
      <path d="m8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5M13.5 5.5l-3 13" />
    </svg>
  );
}

function PinFilterIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(filterIcon, className)}>
      <path d="M12 15.5V21M8.5 3h7l-.7 6.2 2.2 2.1a1 1 0 0 1-.7 1.7H7.7a1 1 0 0 1-.7-1.7l2.2-2.1z" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(filterIcon, className)}>
      <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z" />
    </svg>
  );
}

const filterOptions = [
  { value: "all", label: "All", icon: AllIcon },
  { value: "code", label: "Code", icon: CodeIcon },
  { value: "image", label: "Images", icon: ImageFilterIcon },
  { value: "pinned", label: "Pinned", icon: PinFilterIcon },
  { value: "favorite", label: "Favorites", icon: StarIcon },
] as const;

const clearScopeOptions = [
  { value: "all", label: "Everything", hint: "Every capture in the history" },
  { value: "images", label: "Images only", hint: "Captured screenshots and copied images" },
  { value: "text", label: "Text only", hint: "Captures that are not images" },
] as const satisfies readonly { value: ClearScope; label: string; hint: string }[];

const clearAgeOptions = [
  { value: "any", label: "Any age" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const satisfies readonly { value: ClearAge; label: string }[];

function clearTitle(scope: ClearScope): string {
  if (scope === "images") return "Clear image history?";
  if (scope === "text") return "Clear text history?";
  return "Clear clipboard history?";
}

function clearConfirmLabel(scope: ClearScope): string {
  if (scope === "images") return "Clear images";
  if (scope === "text") return "Clear text";
  return "Clear history";
}

/** Spells out exactly what the current scope and exclusions will remove, so the
 *  confirmation never overstates the sweep. */
function clearSummary(
  scope: ClearScope,
  age: ClearAge,
  includePinned: boolean,
  includeFavorite: boolean,
): string {
  const subject =
    scope === "images"
      ? "Every image in the clipboard history"
      : scope === "text"
        ? "Every non-image capture in the clipboard history"
        : "All clipboard history";
  const olderThan = age === "any" ? "" : ` older than ${age} days`;
  const kept = [!includePinned && "pinned", !includeFavorite && "favorite"].filter(Boolean);
  const clause = kept.length ? ` except ${kept.join(" and ")} items` : " including pinned and favorite items";
  return `${subject}${olderThan}${clause} will be removed, and can be restored for 30 seconds.`;
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn(
        "size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]",
        spinning && "animate-spin motion-reduce:animate-none",
      )}
    >
      <path d="M19.25 12a7.25 7.25 0 1 1-2.13-5.13" />
      <path d="M19.25 4.75V9.5h-4.75" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-4", "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]")}>
      <path d="M7 4.75h10a.75.75 0 0 1 .75.75v13.75L12 16.25l-5.75 3V5.5A.75.75 0 0 1 7 4.75Z" />
    </svg>
  );
}

function ImageFilterIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(filterIcon, className)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <circle cx="9" cy="10.2" r="1.6" />
      <path d="m5 17 4.4-4.4 3 3 2.6-2.4L19 17" />
    </svg>
  );
}

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

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${actionIcon} fill-none stroke-current [stroke-linecap:round] [stroke-width:2]`}
    >
      <path d="M12 5v14M5 12h14" />
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
  // Session-only: revealing a sensitive capture never persists.
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pasteFormat, setPasteFormat] = useState<PasteFormat | null>(null);
  // The first fetch waits for settings so it asks for the stored rows-per-page
  // straight away, rather than loading a default page and replacing it.
  const [settingsRead, setSettingsRead] = useState(false);
  const [compact] = useState(() => getDensity() === "compact");
  const [saveOpen, setSaveOpen] = useState(false);
  const [namingView, setNamingView] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const listScroll = useRef<HTMLDivElement>(null);

  const {
    items: historyItems,
    groupedItems,
    total: historyTotal,
    status: historyStatus,
    paging,
    page,
    pageSize,
    filter,
    groupBy,
    selectedIds,
    multiSelectMode,
    focusRequest,
    clearFocusRequest,
    loadHistory,
    goToPage,
    setPageSize,
    hydratePageSize,
    setFilter,
    sort,
    setSort,
    setGroupBy,
    prependItem,
    replaceItem,
    removeItem,
    removeItems,
    toggleItemSelect,
    selectSingle,
    selectAll,
    clearSelection,
    setMultiSelectMode,
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
    scope,
    setScope,
    age,
    setAge,
    clearBusy,
    clearHistory,
    closeClearDialog,
    handleConfirmKeyDown,
    clearTrigger,
    confirmDialog,
  } = useClearDialog(clearDialogCallbacks);

  const readSettings = useCallback(async () => {
    const settings = await commands.getSettings();
    if (typeof settings.clipboard_tracking === "boolean") {
      setPaused(!settings.clipboard_tracking);
    }
    if (typeof settings.paste_format === "string") {
      setPasteFormat(settings.paste_format);
    }
    hydratePageSize(settings.clipboard_page_size);
  }, [hydratePageSize]);

  /**
   * Re-reads the settings and the history, and drops whatever error was
   * showing. A failed read at launch is normally the app still starting up
   * rather than a broken database, so it is worth asking again.
   */
  const refreshHistory = useCallback(async () => {
    setRefreshing(true);
    setActionError("");
    try {
      await readSettings();
    } catch {
      setActionError("Could not read clipboard tracking status.");
    }
    setSettingsRead(true);
    await loadHistory();
    setRefreshing(false);
  }, [readSettings, loadHistory]);

  useEffect(() => {
    let active = true;
    void readSettings().then(
      () => {
        if (!active) return;
        setSettingsRead(true);
      },
      () => {
        if (!active) return;
        setActionError("Could not read clipboard tracking status.");
        // Unreadable settings must not leave the history unloaded; the default
        // page size is a fine fallback.
        setSettingsRead(true);
      },
    );
    return () => {
      active = false;
    };
  }, [hydratePageSize]);

  useEffect(() => {
    if (settingsRead) loadHistory();
  }, [settingsRead, loadHistory]);

  // Confirmations are transient by nature; leaving the last one on screen
  // makes it look like it belongs to whatever the user does next.
  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(""), 2500);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    // The event carries the full stored item, so prepend it instead of
    // refetching page one and discarding everything the user scrolled past.
    void listenEvent<LibraryItem>("clipboard://captured", (item) => {
      if (item) prependItem(item);
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
  }, [prependItem]);

  // Reveals the item a pinned sidebar entry asked for. Pinned captures are
  // often older than the loaded page, so a miss falls back to the Pinned
  // filter once - the one view guaranteed to contain it - before giving up.
  const focusAttempt = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const target = historyItems.find((item) => item.id === focusRequest.id);
    if (target) {
      focusAttempt.current = null;
      selectSingle(target.id);
      setActiveId(target.id);
      clearFocusRequest();
      requestAnimationFrame(() => {
        const element = itemRefs.current.get(target.id);
        element?.scrollIntoView({ block: "center", behavior: "smooth" });
        element?.focus();
      });
      return;
    }
    if (historyStatus !== "ready") return;
    if (focusAttempt.current === focusRequest.token) {
      clearFocusRequest();
      return;
    }
    focusAttempt.current = focusRequest.token;
    if (filter === "pinned") clearFocusRequest();
    else setFilter("pinned");
  }, [focusRequest, historyItems, historyStatus, filter, selectSingle, setFilter, clearFocusRequest]);

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

  // A manual save produces an ordinary clipboard item, so the only work left
  // here is putting the user in front of it: page one holds the newest rows,
  // and an active filter that excludes it is worth saying out loud rather than
  // leaving them to wonder where it went.
  async function handleSaved(item: LibraryItem) {
    if (!matchesFilter(item, filter)) {
      setActionMessage("Item saved. The current filter hides it.");
      return;
    }
    // Page one gets the row directly; the `clipboard://captured` event the
    // backend also raises is deduplicated by id, so it arrives at most once.
    if (page === 1) prependItem(item);
    else await goToPage(1);
    setActionMessage("Item saved");
    selectSingle(item.id);
    setActiveId(item.id);
  }

  async function changePage(next: number) {
    await goToPage(next);
    // A new page starts at its first row, not wherever the previous page was
    // scrolled to.
    if (listScroll.current) listScroll.current.scrollTop = 0;
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

  function revealItem(id: string) {
    setRevealedIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function handleKeyboardNav(
    event: KeyboardEvent<HTMLDivElement>,
    currentIndex: number,
    onDeleteSelected: () => void,
  ) {
    if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const item = historyItems[currentIndex];
      if (item?.private) {
        event.preventDefault();
        revealItem(item.id);
        return true;
      }
    }
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
  const destructiveBusy = busyId !== null || clearBusy || deleteSelectedBusy;
  const hasSelection = selectedIds.size > 0;
  const effectiveActiveId = activeId && historyItems.some((item) => item.id === activeId)
    ? activeId
    : (selectedIds.size > 0 ? [...selectedIds][0] : historyItems[0]?.id);
  const inspectorItem = historyItems.find((item) => item.id === effectiveActiveId) ?? null;

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
            variant="ghost"
            size="sm"
            className="grid size-8 min-h-0 place-items-center p-0 text-muted-foreground hover:bg-accent hover:text-primary"
            type="button"
            aria-label="Refresh"
            title="Reload the history and clear any error"
            disabled={refreshing}
            onClick={() => void refreshHistory()}
          >
            <RefreshIcon spinning={refreshing} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="grid size-8 min-h-0 place-items-center p-0 text-muted-foreground hover:bg-accent hover:text-primary"
            type="button"
            aria-label="Save this view"
            title="Keep this filter as a saved search"
            onClick={() => setNamingView(true)}
          >
            <BookmarkIcon />
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
          <Button
            className="ml-1 h-8 gap-1.5 px-3 text-xs font-semibold"
            type="button"
            onClick={() => setSaveOpen(true)}
          >
            <PlusIcon />
            Save item
          </Button>
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
            <h3 className="m-0 font-semibold" id="clear-history-title">{clearTitle(scope)}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {clearSummary(scope, age, includePinned, includeFavorite)}
            </p>
            <fieldset className="mt-4 space-y-2 border-0 p-0">
              <legend className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
                What to clear
              </legend>
              {clearScopeOptions.map(({ value, label, hint }) => (
                <RadioCard
                  key={value}
                  name="clear-scope"
                  value={value}
                  checked={scope === value}
                  onChange={(next) => setScope(next as ClearScope)}
                  disabled={clearBusy}
                  label={label}
                  hint={hint}
                />
              ))}
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
                Only older than
              </span>
              <SegmentedRadio
                name="clear-age"
                ariaLabel="Only clear captures older than"
                value={age}
                options={clearAgeOptions}
                onChange={setAge}
                disabled={clearBusy}
                mono
              />
            </div>
            <div className="mt-4 grid gap-2.5 rounded-md border border-border bg-muted/60 p-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
                Kept back by default
              </p>
              <CheckboxField
                checked={includePinned}
                onCheckedChange={setIncludePinned}
                disabled={clearBusy}
                label="Also delete pinned items"
              />
              <CheckboxField
                checked={includeFavorite}
                onCheckedChange={setIncludeFavorite}
                disabled={clearBusy}
                label="Also delete favorite items"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" type="button" disabled={clearBusy} autoFocus onClick={closeClearDialog}>
                Cancel
              </Button>
              <Button variant="destructive" type="button" disabled={clearBusy} onClick={() => void clearHistory()}>
                {clearBusy ? "Clearing…" : clearConfirmLabel(scope)}
              </Button>
            </div>
          </div>
        </div>
      )}
      {actionError && (
        <p className="-mt-3 mb-4 text-xs text-destructive" role="alert">
          {actionError}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-1.5 shadow-[var(--shadow-panel)]">
        <div className={segmentedTrack} role="group" aria-label="Filter captures">
          {filterOptions.map(({ value, label, icon: Icon }) => (
            <Button
              className={segmentedItem}
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              key={value}
            >
              {/* The glyph carries the accent on the active segment, so the
                  label itself stays plain and readable. */}
              <Icon className="text-[var(--color-text-subtle)] transition-colors group-aria-pressed:text-primary" />
              {label}
            </Button>
          ))}
        </div>
        <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border max-[56rem]:hidden" />
        <Button
          className={segmentedItem}
          variant="ghost"
          size="sm"
          type="button"
          aria-pressed={sort === "pinned_first"}
          title="Show pinned captures at the top of every page"
          onClick={() => setSort(sort === "pinned_first" ? "newest" : "pinned_first")}
        >
          <PinFilterIcon className="text-[var(--color-text-subtle)] transition-colors group-aria-pressed:text-primary" />
          Pinned first
        </Button>
        <div className="ml-auto flex items-center gap-2 max-[56rem]:ml-0">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">Group by</span>
          <div className={segmentedTrack} role="group" aria-label="Group captures">
            {([
              { value: undefined, label: "None" },
              { value: "date" as GroupBy, label: "Date" },
              { value: "content_type" as GroupBy, label: "Content type" },
              { value: "kind" as GroupBy, label: "Item kind" },
            ]).map((option) => (
              <Button
                className={segmentedItem}
                variant="ghost"
                size="sm"
                type="button"
                aria-pressed={groupBy === option.value}
                onClick={() => setGroupBy(option.value)}
                key={option.label}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <SavedSearchBar naming={namingView} onNamingChange={setNamingView} />
      {filter === "image" && (
        <ImageBulkBar
          busy={destructiveBusy}
          onDelete={(ids) => deleteSelectedItems(new Set(ids))}
        />
      )}
      <div className="grid min-w-0 items-start gap-4 min-[64rem]:grid-cols-[minmax(0,820px)_19.5rem]">
      {/* The panel is capped to the viewport and the rows scroll inside it, so
          the pager under them is reachable without scrolling past a full page
          of captures first. */}
      <section
        className={
          // Flex, not grid: a grid row sizes itself to its content, so the
          // panel's max height would clip the list instead of making it scroll.
          "flex max-h-[calc(100vh-17rem)] min-h-[min(24rem,calc(100vh-17rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-panel)] max-[31rem]:min-h-[calc(100vh-11rem)] "
          + (hasItems ? "" : "items-center justify-center")
        }
        aria-label="Recent clipboard items"
      >
        {historyStatus === "loading" && <ContentState status="loading" />}
        {historyStatus === "error" && (
          <ContentState status="error" onRetry={() => void refreshHistory()} retrying={refreshing} />
        )}
        {historyStatus === "ready" && historyItems.length === 0 && filter === "all" && (
          <ContentState status="empty" />
        )}
        {historyStatus === "ready" && historyItems.length === 0 && filter !== "all" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status"><div><h3 className="m-0 text-base font-semibold text-foreground">No matching captures</h3><p className="mt-2 text-sm">Try another filter.</p><Button variant="outline" type="button" onClick={() => setFilter("all")}>Clear filter</Button></div></div>}
        {hasItems && (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
            <div
              ref={listScroll}
              className={"min-h-0 w-full min-w-0 flex-1 overflow-y-auto p-3 transition-opacity" + (paging ? " opacity-50" : "")}
              role="listbox"
              aria-label="Clipboard history"
              aria-multiselectable={multiSelectMode}
            >
              {groupBy && groupedItems.length > 0 ? (
                groupedItems.map((group) => (
                  <div key={group.label} className="mb-4">
                    <div className="mb-2 flex items-center gap-2 border-b border-border pb-1">
                      <h4 className="text-xs font-semibold text-muted-foreground">{group.label}</h4>
                      <span className="text-xs text-muted-foreground">({group.items.length})</span>
                    </div>
                    {group.items.map((item, index) => {
                      return (
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
                          compact={compact}
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
                          onActivateMultiSelect={() => setMultiSelectMode(true)}
                          revealed={revealedIds.has(item.id)}
                          onReveal={() => revealItem(item.id)}
                          key={item.id}
                        />
                      );
                    })}
                  </div>
                ))
              ) : (
                historyItems.map((item, index) => (
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
                      compact={compact}
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
                      onActivateMultiSelect={() => setMultiSelectMode(true)}
                    revealed={revealedIds.has(item.id)}
                    onReveal={() => revealItem(item.id)}
                    key={item.id}
                  />
                ))
              )}
            </div>
            {/* The single count readout for this screen lives here, beside the
                controls that change it. */}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={historyTotal}
              count={historyItems.length}
              pageSizes={PAGE_SIZES}
              busy={paging}
              label="Clipboard history pages"
              className="shrink-0 bg-card"
              onPageChange={(next) => void changePage(next)}
              onPageSizeChange={(size) => setPageSize(size as (typeof PAGE_SIZES)[number])}
            />
          </div>
        )}
      </section>
      <ItemInspector
        item={inspectorItem}
        busy={destructiveBusy}
        revealed={inspectorItem ? revealedIds.has(inspectorItem.id) : false}
        pasteFormat={pasteFormat}
        onReveal={() => inspectorItem && revealItem(inspectorItem.id)}
        onCopy={() => inspectorItem && copyItem(inspectorItem)}
        onTogglePin={() => inspectorItem && togglePin(inspectorItem)}
        onToggleFavorite={() => inspectorItem && toggleFavorite(inspectorItem)}
      />
      {hasItems && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2 text-[0.68rem] text-[var(--color-text-subtle)]"
          aria-label="Keyboard shortcuts"
        >
          {clipboardShortcutHints().map((hint) => (
            <span key={hint.action} className="whitespace-nowrap">
              <span className="font-mono font-semibold text-muted-foreground">{hint.combo}</span> {hint.action}
            </span>
          ))}
        </div>
      )}
      </div>
      {undoReceipt && (
        <UndoToast
          receipt={undoReceipt}
          busy={undoBusy}
          onUndo={() => void undoDelete()}
          onDismiss={() => setUndoReceipt(null)}
        />
      )}
      {/* Confirmations used to be announced to screen readers and shown to
          nobody. This is the one carrier for both. The undo toast owns the
          bottom-right corner, so this yields to it. */}
      {actionMessage && !undoReceipt && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-[0.8rem] font-semibold text-foreground shadow-[var(--shadow-panel)]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-current text-[var(--color-positive)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {actionMessage}
        </div>
      )}
      <SaveItemDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSaved={(item) => void handleSaved(item)}
      />
    </main>
  );
}
