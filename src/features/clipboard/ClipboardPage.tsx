import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { commands } from "../../api/commands";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { DeleteReceipt, LibraryItem, PasteFormat } from "../../api/types";
import ClipboardItem from "./ClipboardItem";
import ItemInspector from "./ItemInspector";
import SaveItemDialog from "./SaveItemDialog";
import UndoToast from "./UndoToast";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { RadioCard, SegmentedRadio } from "@/components/ui/radio-group";
import { CheckboxField } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { filterCountQuery, matchesFilter, PAGE_SIZES, useClipboardStore } from "../../stores/clipboardStore";
import ImageBulkBar from "./ImageBulkBar";
import SavedSearchBar from "./SavedSearchBar";
import { SourceFilterButton } from "./SourceAppList";
import GroupMenu, { toolbarMenuButton } from "./GroupMenu";
import { useClipboardActions } from "../../hooks/useClipboardActions";
import { useClearDialog } from "../../hooks/useClearDialog";
import type { ClearAge, ClearScope } from "../../hooks/useClearDialog";
import type { ClipboardFilter, GroupedItems } from "../../stores/clipboardStore";
import { getDensity } from "../../lib/density";
import { formatRelativeTime } from "../../lib/relativeTime";
import { clipboardShortcutHints, quickPasteShortcutHint } from "../../lib/shortcutHints";
import type { ShortcutOverrides } from "../../lib/shortcutHints";
import { KeyCombo } from "@/components/ui/key-cap";

/** A burst of captures should cost one round of pill counts, not one per
 *  capture. */
const FILTER_COUNT_DELAY_MS = 400;

/**
 * How many captures sit behind each filter pill. Each is one count query -
 * a one-row search read for its `total` - re-run whenever the library
 * changes, so a pill never advertises a number the list will not show.
 *
 * These were re-run whenever the page's rows changed, and a pill click
 * changes them without changing a single count: five queries per click for
 * the numbers already on screen.
 */
function useFilterCounts(
  ready: boolean,
  revision: number,
  sourceApps: readonly string[] | null,
): Partial<Record<ClipboardFilter, number>> {
  const [counts, setCounts] = useState<Partial<Record<ClipboardFilter, number>>>({});
  // What the counts on screen were taken for. `ready` gates a count but does
  // not call for one: a filter click passes through loading and back again.
  const countedFor = useRef<string | null>(null);

  useEffect(() => {
    // Only once the list itself has landed, and not on the way through a
    // loading or failed state: the pills are a footnote to the history, and
    // they must never be the reason the backend is asked anything twice
    // while a capture is still arriving.
    if (!ready) return;
    const key = `${revision}:${JSON.stringify(sourceApps)}`;
    if (countedFor.current === key) return;
    let active = true;
    const timer = setTimeout(() => {
      const filters: ClipboardFilter[] = ["all", "code", "image", "pinned", "favorite"];
      void Promise.all(
        filters.map((filter) =>
          commands
            .searchItems(filterCountQuery(filter, sourceApps))
            .then((result) => [filter, result?.total ?? 0] as const)
            .catch(() => [filter, undefined] as const),
        ),
      ).then((entries) => {
        if (!active) return;
        countedFor.current = key;
        const next: Partial<Record<ClipboardFilter, number>> = {};
        for (const [filter, total] of entries) {
          if (typeof total === "number") next[filter] = total;
        }
        setCounts(next);
      });
    }, FILTER_COUNT_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ready, revision, sourceApps]);

  return counts;
}

function ContentState({
  status,
  onRetry,
  retrying,
  quickPaste,
}: {
  status: "loading" | "empty" | "error";
  onRetry?: () => void;
  retrying?: boolean;
  /** The binding in force for Quick Paste, shown on the empty state. */
  quickPaste?: string | null;
}) {
  if (status === "loading") {
    // Placeholder rows rather than a lone spinner: the panel keeps the shape
    // the list is about to take, so the arrival of real rows is a fill-in
    // rather than a jump.
    return (
      <div className="w-full self-stretch" role="status" aria-busy="true">
        <span className="sr-only">Loading history…</span>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div
            key={row}
            aria-hidden="true"
            className="border-b border-border/60 px-4 py-3 last:border-b-0"
            // Each row starts its pulse slightly later than the one above, so
            // the placeholder reads as a list settling rather than one block
            // flashing.
            style={{ animationDelay: `${row * 90}ms` }}
          >
            <div className="animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${row * 90}ms` }}>
              <div className="h-3 rounded-sm bg-muted" style={{ width: `${88 - row * 7}%` }} />
              <div className="mt-2 h-3 w-[46%] rounded-sm bg-muted" />
              <div className="mt-3 flex items-center gap-2">
                <div className="h-2.5 w-16 rounded-sm bg-muted" />
                <div className="h-2.5 w-10 rounded-sm bg-muted/70" />
                <div className="ml-auto h-2.5 w-12 rounded-sm bg-muted/70" />
              </div>
            </div>
          </div>
        ))}
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
        <p className="mt-2 text-sm leading-relaxed">Copy text or an image anywhere on this computer and it lands here.</p>
        {/* The first screen a new install shows, and until now the only one
            that taught nothing. Quick Paste is the feature someone has to be
            told about - it works while another app has focus, so it is
            undiscoverable from inside this window. */}
        {quickPaste && (
          <p className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            {/* The combo never breaks - "Ctrl Shift" over a lone "V" reads as
                two shortcuts - so the label is what wraps when space runs out. */}
            <KeyCombo binding={quickPaste} className="shrink-0 flex-nowrap" />
            <span className="min-w-0">opens Quick Paste from any application</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The list is empty because of a narrowing the user applied, not because there
 * is nothing to show. Each cause names itself and offers the way out of that
 * one cause - clearing a filter does not close a folder, so one generic
 * "Clear filter" could not stand in for all three.
 */
/** One column in a narrow desk, two once it has room: the cards keep a
 *  readable measure instead of stretching into lines too long to scan. */
const cardGrid = "grid grid-cols-1 items-stretch gap-4 @[34rem]:grid-cols-2";

const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

/**
 * A group's heading, set like a date at the top of a page in a notebook: the
 * day in the display face, then - for Today and Yesterday, whose names do not
 * say which date they are - the date itself in italic, a rule, and the count.
 *
 * `aria-hidden`: the listbox holds options, and a heading that answered to the
 * arrow keys would put a stop in the middle of the card sequence. Each card
 * already says when it was captured.
 */
function DayHeading({ group, dated }: { group: GroupedItems; dated: boolean }) {
  const relative = dated && (group.label === "Today" || group.label === "Yesterday");
  const first = group.items[0];
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-[3] -mx-1 mb-3 flex items-baseline gap-3.5 bg-background px-1 pb-2 pt-1"
    >
      <h4 className="m-0 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {group.label}
      </h4>
      {relative && first && (
        <span className="font-display text-[1.02rem] italic text-muted-foreground max-[31rem]:hidden">
          {longDate.format(new Date(first.created_at))}
        </span>
      )}
      <span className="h-px min-w-6 flex-1 self-center bg-border" />
      <span className="whitespace-nowrap text-[0.8rem] text-muted-foreground">
        {group.items.length.toLocaleString()} {group.items.length === 1 ? "capture" : "captures"}
      </span>
    </div>
  );
}

function NarrowedEmpty({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground max-[31rem]:flex-col max-[31rem]:p-6 max-[31rem]:text-center"
      role="status"
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
      </span>
      <div>
        <h3 className="m-0 text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed">{body}</p>
        <Button className="mt-3" variant="outline" size="sm" type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

const actionIcon = "size-4 shrink-0";

// One recipe for both segmented groups (filter, grouping) so the two cannot
// drift apart. `group` is what lets an active segment tint its own icon.
const segmentedTrack =
  "flex items-center gap-1.5";
const headerIcon =
  "grid size-[30px] min-h-0 place-items-center rounded-[7px] p-0 text-[var(--text-muted)] hover:bg-muted hover:text-foreground";
// Paper chips: outlined at rest, filled with ink when chosen - the same
// language as the reading panel's "Copy it as" row.
const segmentedItem =
  "group h-8 min-h-0 gap-1.5 rounded-full border border-[var(--border-strong)] bg-transparent px-3 text-[0.8rem] font-medium text-muted-foreground transition-[background-color,color,border-color] duration-100 hover:bg-card hover:text-foreground";

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


/** Overlapping frames with a tick: "act on several of these at once". */
function SelectIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${actionIcon} fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]`}
    >
      <path d="M8 4.75h11.25V16" />
      <rect x="4.75" y="8" width="11.5" height="11.25" rx="1.6" />
      <path d="m7.75 13.6 2.1 2.1 3.9-4" />
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
  searchSlot,
}: {
  /** The workspace search field. App owns the query, so the field is handed
   *  down and rendered here, under this page's heading. */
  searchSlot?: ReactNode;
}) {
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoReceipt, setUndoReceipt] = useState<DeleteReceipt | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  // Session-only: revealing a sensitive capture never persists.
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pasteFormat, setPasteFormat] = useState<PasteFormat | null>(null);
  // The first fetch waits for settings so it asks for the stored rows-per-page
  // straight away, rather than loading a default page and replacing it.
  const [settingsRead, setSettingsRead] = useState(false);
  const [shortcutOverrides, setShortcutOverrides] = useState<ShortcutOverrides>({});
  const [compact] = useState(() => getDensity() === "compact");
  const [saveOpen, setSaveOpen] = useState(false);
  // Which item the inspector was dismissed for. Selecting anything else brings
  // it straight back, so closing it is a "not this one" rather than a mode the
  // user has to remember to leave.
  const [closedInspectorId, setClosedInspectorId] = useState<string | null>(null);
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
    pageRequest,
    libraryRevision,
    clearFocusRequest,
    clearPageRequest,
    loadHistory,
    resetView,
    goToPage,
    setPageSize,
    hydratePageSize,
    setFilter,
    clearSavedSearch,
    setSourceApps,
    sort,
    setSort,
    setGroupBy,
    sourceApps,
    savedSearch,
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

  // Which row was just copied. Cleared first so copying the same row twice
  // restarts its flash instead of leaving the attribute unchanged.
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(null), 950);
    return () => clearTimeout(timer);
  }, [flashId]);
  const actionCallbacks = useMemo(
    () => ({
      onReplaceItem: replaceItem,
      onRemoveItem: removeItem,
      onRemoveItems: removeItems,
      onSetUndoReceipt: setUndoReceipt,
      onSetActionMessage: setActionMessage,
      onSetActionError: setActionError,
      onCopied: (id: string) => {
        setFlashId(null);
        requestAnimationFrame(() => setFlashId(id));
      },
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
    if (typeof settings.paste_format === "string") {
      setPasteFormat(settings.paste_format);
    }
    setShortcutOverrides(settings.custom_shortcuts ?? {});
    hydratePageSize(settings.clipboard_page_size);
  }, [hydratePageSize]);

  /**
   * Refresh is a reload *and* a reset: the view goes back to how it opens -
   * no filter, no smart folder, no source narrowing, newest first, ungrouped,
   * page one, nothing selected, nothing revealed, no leftover banner - and
   * the settings and history are read again from scratch.
   *
   * `resetView` runs first so the panel drops to its spinner immediately
   * rather than showing the old page throughout, and so the stored
   * rows-per-page that `readSettings` applies is not clobbered by the reset
   * that follows it.
   */
  const refreshHistory = useCallback(async () => {
    setRefreshing(true);
    resetView();
    setActionError("");
    setActionMessage("");
    setUndoReceipt(null);
    setActiveId(null);
    setRevealedIds(new Set());
    setNamingView(false);
    try {
      await readSettings();
    } catch {
      setActionError("Could not read clipboard tracking status.");
    }
    setSettingsRead(true);
    await loadHistory();
    setRefreshing(false);
  }, [resetView, readSettings, loadHistory]);

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

  // Reveals the item a pinned Library entry asked for. Pinned captures are
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

  /**
   * The rows in the order they are on screen. Grouping reorders the page -
   * `groupedItems` gathers each group's rows together - so arrow keys and the
   * next/previous shortcuts have to walk this list rather than the fetch
   * order in `items`, or they jump between groups.
   */
  const renderedItems = useMemo(
    () => (groupBy && groupedItems.length > 0 ? groupedItems.flatMap((group) => group.items) : historyItems),
    [groupBy, groupedItems, historyItems],
  );
  const rowIndex = useMemo(
    () => new Map(renderedItems.map((item, index) => [item.id, index])),
    [renderedItems],
  );

  const shortcutState = useRef({
    busyId,
    clearBusy,
    deleteSelectedBusy,
    historyItems,
    renderedItems,
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
      renderedItems,
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
      const { renderedItems, selectedIds, selectSingle } = shortcutState.current;
      if (!renderedItems.length) return;
      const lastSelected = selectedIds.size > 0
        ? renderedItems.findIndex((item) => item.id === [...selectedIds].at(-1))
        : -1;
      const current = lastSelected < 0 ? 0 : lastSelected;
      const next = Math.max(0, Math.min(current + offset, renderedItems.length - 1));
      const item = renderedItems[next];
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
    // The same predicate `prependItem` applies, source filter included -
    // without it a save could be announced as visible and then dropped by the
    // active source narrowing.
    if (!matchesFilter(item, filter, sourceApps)) {
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
      const item = renderedItems[currentIndex];
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
      const item = renderedItems[currentIndex];
      if (item) toggleItemSelect(item.id);
      return true;
    }
    return false;
  }

  /**
   * Where Up or Down lands in the card grid: the card above or below, a whole
   * row away - which is one card while the desk is a single column. Past the
   * top or bottom of a group, the step goes to the nearest card of the group
   * beside it, so the arrows never stall at a day heading.
   *
   * Cards within a group are consecutive in `renderedItems`, in the same
   * order as the grid's children, so a position in the grid maps straight
   * back to an index in the page.
   */
  function gridStep(index: number, direction: 1 | -1): number {
    const card = itemRefs.current.get(renderedItems[index]?.id ?? "");
    const grid = card?.parentElement;
    if (!card || !grid) return index + direction;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
    if (columns <= 1) return index + direction;
    const cards = Array.from(grid.children);
    const at = cards.indexOf(card);
    const target = at + direction * columns;
    if (target >= 0 && target < cards.length) return index + direction * columns;
    return direction > 0 ? index + (cards.length - at) : index - (at + 1);
  }

  function selectByKeyboard(event: KeyboardEvent<HTMLDivElement>, currentIndex: number) {
    const handled = handleKeyboardNav(event, currentIndex, () => void deleteSelectedItems(selectedIds));
    if (handled) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      nextIndex = Math.min(Math.max(gridStep(currentIndex, event.key === "ArrowDown" ? 1 : -1), 0), renderedItems.length - 1);
    } else if (event.key === "ArrowRight") {
      nextIndex = Math.min(currentIndex + 1, renderedItems.length - 1);
    } else if (event.key === "ArrowLeft") {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = renderedItems.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextItem = renderedItems[nextIndex];
    if (!nextItem) return;
    if (event.shiftKey && multiSelectMode) {
      toggleItemSelect(nextItem.id);
    } else {
      selectSingle(nextItem.id);
    }
    setActiveId(nextItem.id);
    itemRefs.current.get(nextItem.id)?.focus();
  }

  // Hidden pills cost nothing: five count queries per history change would
  // otherwise still run for a row nobody can see.
  const filterCounts = useFilterCounts(
    historyStatus === "ready" && !savedSearch,
    libraryRevision,
    sourceApps,
  );
  const hasItems = historyStatus === "ready" && historyItems.length > 0;
  const destructiveBusy = busyId !== null || clearBusy || deleteSelectedBusy;

  // A dialog the command palette asked for. Clear waits for the history to
  // load, and then asks only if its own button could have: the palette is a
  // second way to the same dialog, not a way around what disables it.
  useEffect(() => {
    if (pageRequest === "save") {
      clearPageRequest();
      setSaveOpen(true);
      return;
    }
    if (pageRequest !== "clear" || historyStatus === "loading") return;
    clearPageRequest();
    if (hasItems && !destructiveBusy) setConfirmClear(true);
  }, [pageRequest, historyStatus, hasItems, destructiveBusy, clearPageRequest, setConfirmClear]);
  // A plain click selects its row too, but that is the row the inspector is
  // showing, not a selection to act on in bulk. Offering bulk actions for it
  // added them to the header on the press itself, and in a window of the
  // default size that wrapped the header onto a second line - moving the row
  // out from under the pointer before the click could land.
  const hasSelection = selectedIds.size > 1 || (multiSelectMode && selectedIds.size > 0);
  const effectiveActiveId = activeId && historyItems.some((item) => item.id === activeId)
    ? activeId
    : (selectedIds.size > 0 ? [...selectedIds][0] : historyItems[0]?.id);
  const inspectorItem = effectiveActiveId === closedInspectorId
    ? null
    : historyItems.find((item) => item.id === effectiveActiveId) ?? null;

  // One card, wherever it sits: a date group, a type group, or the flat
  // page. `index` is its place in the whole page, which the arrow keys walk.
  function renderCard(item: LibraryItem, index: number) {
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
        flash={item.id === flashId}
        onReveal={() => revealItem(item.id)}
        key={item.id}
      />
    );
  }

  return (
    // Two columns: the desk, which scrolls, and the reading panel beside it,
    // which keeps the chosen capture in view however far the desk is
    // scrolled. Below 60rem the panel follows the desk instead.
    <main className="grid h-full min-h-0 min-w-0 [overflow-wrap:anywhere] min-[60rem]:grid-cols-[minmax(0,1fr)_minmax(20rem,23.75rem)] max-[60rem]:h-auto">
    <div
      ref={listScroll}
      className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-10 pb-6 pt-6 max-[56rem]:px-6 max-[31rem]:px-3 max-[60rem]:overflow-visible"
    >
      {/* The page is named for assistive technology; on screen the day
          headings below say what is here, as a desk would. */}
      <h2 className="sr-only" ref={heading} id="workspace-title" tabIndex={-1}>Recent captures</h2>
      {searchSlot}
      {confirmClear && (
        <div className="fixed inset-0 z-50 grid animate-[fade-in_140ms_ease-out] place-items-center bg-background/60 p-5 backdrop-blur-sm motion-reduce:animate-none">
          <div
            ref={confirmDialog}
            className="w-full max-w-sm animate-[menu-in_160ms_ease-out] rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-menu)] motion-reduce:animate-none"
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
              <legend className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
      {/* Two rows: what to show (the filter chips, and how much there is),
          then how to show it (source, grouping, order) with the history's
          own actions at the end. One wrapping row broke wherever the window
          happened to end. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {/* A folder carries its own predicate, and these counts are taken
            against the unfiltered history - so while one is open the pills
            would advertise numbers for a list nobody is looking at. The
            folder bar below owns the way out.
            The track wraps as a last resort: five labelled pills with counts
            are wider than a phone-width window, and ran off its right edge. */}
        {!savedSearch && (
        <div className={cn(segmentedTrack, "min-w-0 max-w-full flex-wrap")} role="group" aria-label="Filter captures">
          {filterOptions.map(({ value, label, icon: Icon }) => {
            const count = filterCounts[value];
            const active = filter === value;
            return (
              <Button
                className={cn(
                  segmentedItem,
                  // The active pill is filled, not outlined: it is the one
                  // piece of state in this row worth reading from across the
                  // window.
                  "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:ring-0",
                )}
                variant="ghost"
                size="sm"
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(value)}
                key={value}
              >
                {/* The label carries the filter, so the icon is the first
                    thing to go when the row runs out of room. */}
                <Icon className={cn(active ? "" : "text-[var(--text-muted)] transition-colors", "max-[36rem]:hidden")} />
                {label}
                {/* How much is behind each pill, so the choice is made before
                    clicking rather than after. */}
                {count !== undefined && (
                  <span
                    // Decorative: the pill's name stays the filter, and the
                    // list's own "1-100 of 202" is what reports the number.
                    aria-hidden="true"
                    className={cn(
                      "font-mono text-[0.62rem] tabular-nums",
                      active ? "opacity-70" : "text-[var(--text-muted)]",
                    )}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
        )}
        {hasItems && (
          <p className="m-0 ml-auto whitespace-nowrap text-[0.8rem] text-muted-foreground max-[48rem]:hidden">
            {historyTotal.toLocaleString()} {historyTotal === 1 ? "item" : "items"}
            {historyItems[0] && ` · newest ${formatRelativeTime(historyItems[0].created_at)}`}
          </p>
        )}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-border pb-3">
        <SourceFilterButton />
        <GroupMenu value={groupBy} onChange={setGroupBy} />
        <button
          className={cn(toolbarMenuButton, "aria-pressed:bg-[var(--accent-subtle)] aria-pressed:text-[var(--accent-ink)]")}
          type="button"
          aria-pressed={sort === "pinned_first"}
          title="Show pinned captures at the top of every page"
          onClick={() => setSort(sort === "pinned_first" ? "newest" : "pinned_first")}
        >
          <PinFilterIcon className="size-3.5" />
          Pinned first
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 max-[31rem]:gap-1">
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
          <div className="flex items-center gap-0.5" role="group" aria-label="History actions">
          <Button
            variant="ghost"
            size="sm"
            className={headerIcon}
            type="button"
            aria-label="Refresh"
            title="Reset the filters and reload the history"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={() => void refreshHistory()}
          >
            <RefreshIcon spinning={refreshing} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(headerIcon, "aria-pressed:bg-[var(--accent-subtle)] aria-pressed:text-[var(--accent-ink)]")}
            type="button"
            aria-pressed={multiSelectMode}
            aria-label={multiSelectMode ? "Leave selection mode" : "Select multiple"}
            title={multiSelectMode ? "Leave selection mode" : "Select multiple items"}
            disabled={!hasItems}
            onClick={() => {
              if (multiSelectMode) clearSelection();
              else setMultiSelectMode(true);
            }}
          >
            <SelectIcon />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={headerIcon}
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
            className={cn(headerIcon, "hover:bg-destructive/10 hover:text-destructive")}
            disabled={!hasItems || destructiveBusy}
            aria-label="Clear history"
            title="Clear history"
            onClick={() => setConfirmClear(true)}
          >
            <TrashIcon />
          </Button>
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
      <section className="@container min-w-0" aria-label="Recent clipboard items">
        {historyStatus === "loading" && <ContentState status="loading" />}
        {historyStatus === "error" && (
          <ContentState status="error" onRetry={() => void refreshHistory()} retrying={refreshing} />
        )}
        {/* An empty list means one of two different things, and saying the
            wrong one is worse than saying nothing: "your clipboard is quiet"
            is a lie when the history is full and a folder or a source filter
            is what emptied the view. Narrowings are checked first, innermost
            first, so the control offered undoes the thing actually
            responsible. */}
        {historyStatus === "ready" && historyItems.length === 0 && (
          savedSearch ? (
            <NarrowedEmpty
              title="Nothing in this folder"
              body={`No captures match ${savedSearch.name}. The rest of your history is still here.`}
              actionLabel="Close folder"
              onAction={clearSavedSearch}
            />
          ) : sourceApps && sourceApps.length > 0 ? (
            <NarrowedEmpty
              title="Nothing from this source"
              body="No captures came from the application you are filtering by."
              actionLabel="Show all sources"
              onAction={() => setSourceApps(null)}
            />
          ) : filter !== "all" ? (
            <NarrowedEmpty
              title="No matching captures"
              body="Nothing in the history matches this filter."
              actionLabel="Clear filter"
              onAction={() => setFilter("all")}
            />
          ) : (
            <ContentState status="empty" quickPaste={quickPasteShortcutHint(shortcutOverrides)} />
          )
        )}
        {hasItems && (
          <>
            <div
              className={"min-w-0 transition-opacity" + (paging ? " opacity-50" : "")}
              role="listbox"
              aria-label="Clipboard history"
              aria-multiselectable={multiSelectMode}
            >
              {groupBy && groupedItems.length > 0 ? (
                groupedItems.map((group) => (
                  <div key={group.label} className="mb-7 last:mb-2">
                    <DayHeading group={group} dated={groupBy === "date"} />
                    <div className={cardGrid}>
                      {group.items.map((item) => renderCard(item, rowIndex.get(item.id) ?? 0))}
                    </div>
                  </div>
                ))
              ) : (
                <div className={cardGrid}>
                  {historyItems.map((item, index) => renderCard(item, index))}
                </div>
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
              className="mt-4 shrink-0 rounded-xl border border-border bg-card"
              onPageChange={(next) => void changePage(next)}
              onPageSizeChange={(size) => setPageSize(size as (typeof PAGE_SIZES)[number])}
            />
          </>
        )}
      </section>
      {hasItems && (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2 text-[0.68rem] text-[var(--text-muted)]"
          aria-label="Keyboard shortcuts"
        >
          {clipboardShortcutHints(shortcutOverrides).map((hint) => (
            <span key={hint.action} className="whitespace-nowrap">
              <span className="font-mono font-semibold text-muted-foreground">{hint.combo}</span> {hint.action}
            </span>
          ))}
        </div>
      )}
    </div>
      <ItemInspector
        item={inspectorItem}
        busy={destructiveBusy}
        revealed={inspectorItem ? revealedIds.has(inspectorItem.id) : false}
        pasteFormat={pasteFormat}
        onReveal={() => inspectorItem && revealItem(inspectorItem.id)}
        onCopy={(transform) => inspectorItem && copyItem(inspectorItem, transform)}
        onTogglePin={() => inspectorItem && togglePin(inspectorItem)}
        onToggleFavorite={() => inspectorItem && toggleFavorite(inspectorItem)}
        onDelete={() => inspectorItem && void deleteItem(inspectorItem)}
        onClose={() => setClosedInspectorId(effectiveActiveId ?? null)}
      />
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
      {actionMessage && !undoReceipt && <Toast>{actionMessage}</Toast>}
      <SaveItemDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSaved={(item) => void handleSaved(item)}
      />
    </main>
  );
}
