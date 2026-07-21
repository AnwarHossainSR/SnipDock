import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import { listenEvent } from "../../api/events";
import type { ContentType, DeleteReceipt, LibraryItem, SearchQuery } from "../../api/types";
import ClipboardItem from "./ClipboardItem";
import UndoToast from "./UndoToast";

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
  limit: 100,
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
      <div className="content-state" role="status" aria-busy="true">
        <span className="loading-ring" aria-hidden="true" />
        <p>Loading history…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="content-state content-state-error" role="alert">
        <span className="state-mark" aria-hidden="true">
          !
        </span>
        <div>
          <h3>Clipboard history unavailable</h3>
          <p>Close and reopen SnipDock to try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-state" role="status">
      <span className="empty-dock" aria-hidden="true">
        <span />
      </span>
      <div>
        <h3>Your clipboard is quiet</h3>
        <p>Copy text and it will appear here, ready when you need it.</p>
      </div>
    </div>
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoReceipt, setUndoReceipt] = useState<DeleteReceipt | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const clearTrigger = useRef<HTMLButtonElement>(null);
  const confirmDialog = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const loadHistory = useCallback(async () => {
    const id = ++requestId.current;
    const result = await commands.searchItems(queryFor(filter));
    if (id !== requestId.current) return;
    setHistory({ status: "ready", items: result.items, total: result.total });
    setSelectedId((current) => result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? null));
  }, [filter]);

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
    let unlisten: (() => void) | undefined;
    void listenEvent<LibraryItem>("clipboard://captured", () => {
      void loadHistory();
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [loadHistory]);

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
    document.getElementById(`clipboard-item-${nextItem.id}`)?.focus();
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
      const receipt = await commands.clearClipboardHistory();
      setHistory((current) =>
        current.status === "ready"
          ? { ...current, items: [], total: 0 }
          : current,
      );
      setSelectedId(null);
      setUndoReceipt(receipt);
      document.getElementById("workspace-title")?.focus();
      setConfirmClear(false);
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
      const enabled = await commands.setClipboardTracking(paused);
      setPaused(!enabled);
    } catch {
      setActionError("Could not change clipboard tracking.");
    } finally {
      setTrackingBusy(false);
    }
  }

  const hasItems = history.status === "ready" && history.items.length > 0;
  const destructiveBusy = busyId !== null || clearBusy;

  return (
    <main className="workspace-content">
      <header className="content-heading">
        <div>
          <p>Clipboard history</p>
          <h2 id="workspace-title" tabIndex={-1}>Recent captures</h2>
        </div>
        <div className="history-summary">
          <div className="tracking-control">
            <span className={paused ? "tracking-status paused" : "tracking-status"}>
              <span aria-hidden="true" />
              {paused ? "Tracking paused" : "Tracking active"}
            </span>
            <button
              className="tracking-toggle"
              type="button"
              disabled={trackingBusy}
              onClick={() => void toggleTracking()}
            >
              {paused ? "Resume tracking" : "Pause tracking"}
            </button>
          </div>
          <button
            ref={clearTrigger}
            className="clear-history"
            type="button"
            disabled={!hasItems || destructiveBusy}
            onClick={() => setConfirmClear(true)}
          >
            Clear history
          </button>
          <span className="item-count">
            {history.total} {history.total === 1 ? "item" : "items"}
          </span>
        </div>
      </header>
      {confirmClear && (
        <div className="confirm-backdrop">
          <div
            ref={confirmDialog}
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            tabIndex={-1}
            onKeyDown={handleConfirmKeyDown}
          >
            <h3 id="clear-history-title">Clear clipboard history?</h3>
            <p>{history.total} items will be removable for 30 seconds.</p>
            <div className="confirm-actions">
              <button
                type="button"
                disabled={clearBusy}
                autoFocus
                onClick={closeClearDialog}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={clearBusy}
                onClick={() => void clearHistory()}
              >
                {clearBusy ? "Clearing…" : "Clear history"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {actionMessage}
      </div>
      {actionError && (
        <p className="action-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="clipboard-filters" aria-label="Clipboard filters">
        {(["all", "code", "pinned", "favorite"] as const).map((value) => (
          <button className="filter-chip" type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>
            {value === "all" ? "All" : value === "favorite" ? "Favorites" : value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
        <span className="item-count">{history.total} filtered</span>
      </div>
      <section
        className={hasItems ? "content-panel clipboard-panel has-items" : "content-panel clipboard-panel"}
        aria-label="Recent clipboard items"
      >
        {history.status === "loading" && <ContentState status="loading" />}
        {history.status === "error" && <ContentState status="error" />}
        {history.status === "ready" && history.items.length === 0 && filter === "all" && (
          <ContentState status="empty" />
        )}
        {history.status === "ready" && history.items.length === 0 && filter !== "all" && <div className="content-state" role="status"><div><h3>No matching captures</h3><p>Try another filter.</p><button className="button-secondary" type="button" onClick={() => setFilter("all")}>Clear filter</button></div></div>}
        {hasItems && (
          <div className="clipboard-list" role="listbox" aria-label="Clipboard history">
            {history.items.map((item, index) => (
              <ClipboardItem
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
