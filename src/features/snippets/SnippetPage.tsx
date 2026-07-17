import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../lib/commands";
import type { DeleteReceipt, LibraryItem, SearchQuery } from "../../lib/types";
import SnippetDetail from "./SnippetDetail";
import SnippetEditor from "./SnippetEditor";
import UndoToast from "../clipboard/UndoToast";

const snippetQuery: SearchQuery = {
  text: null,
  kinds: ["snippet", "command", "template", "note"],
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

type LibraryState =
  | { status: "loading"; items: LibraryItem[]; total: number }
  | { status: "ready"; items: LibraryItem[]; total: number }
  | { status: "error"; items: LibraryItem[]; total: number };

function itemTitle(item: LibraryItem) {
  return item.title?.trim() || item.kind[0].toUpperCase() + item.kind.slice(1);
}

export default function SnippetPage() {
  const [library, setLibrary] = useState<LibraryState>({
    status: "loading",
    items: [],
    total: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibraryItem | null | false>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [undoReceipt, setUndoReceipt] = useState<DeleteReceipt | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const focusTarget = useRef<string | null>(null);
  const editorReturnFocus = useRef("new-snippet");

  useEffect(() => {
    let active = true;
    commands.searchItems(snippetQuery).then(
      (result) => {
        if (!active) return;
        setLibrary({ status: "ready", items: result.items, total: result.total });
        setSelectedId(result.items[0]?.id ?? null);
      },
      () => {
        if (active) setLibrary({ status: "error", items: [], total: 0 });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!focusTarget.current) return;
    const target = document.getElementById(focusTarget.current);
    if (!target) return;
    target.focus();
    focusTarget.current = null;
  }, [editing, selectedId, library.items]);

  const selected = library.items.find((item) => item.id === selectedId) ?? null;

  function updateLibrary(
    update: (items: LibraryItem[]) => LibraryItem[],
    totalChange = 0,
  ) {
    setLibrary((current) => current.status === "ready"
      ? {
          ...current,
          items: update(current.items),
          total: Math.max(0, current.total + totalChange),
        }
      : current);
  }

  function replaceItem(updated: LibraryItem) {
    updateLibrary((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  async function runItemAction<T>(
    item: LibraryItem,
    command: () => Promise<T>,
    apply: (result: T) => void,
  ) {
    setBusyId(item.id);
    setActionError("");
    try {
      apply(await command());
    } catch {
      setActionError("Could not update this library item.");
    } finally {
      setBusyId(null);
    }
  }

  function copyItem(item: LibraryItem) {
    void runItemAction(item, () => commands.copyItem(item.id, "raw"), (receipt) => {
      replaceItem({
        ...item,
        usage_count: item.usage_count + 1,
        last_used_at: receipt.copied_at,
      });
      setActionMessage(`Copied to clipboard. Used ${item.usage_count + 1} times.`);
    });
  }

  function setFlags(
    item: LibraryItem,
    flags: { pinned: boolean | null; favorite: boolean | null; archived: boolean | null },
  ) {
    void runItemAction(
      item,
      () => commands.setItemFlags(item.id, flags),
      replaceItem,
    );
  }

  function removeItem(item: LibraryItem) {
    const remaining = library.items.filter((entry) => entry.id !== item.id);
    focusTarget.current = remaining[0]
      ? `snippet-item-${remaining[0].id}`
      : "new-snippet";
    updateLibrary((items) => items.filter((entry) => entry.id !== item.id), -1);
    setSelectedId(remaining[0]?.id ?? null);
  }

  function archiveItem(item: LibraryItem) {
    void runItemAction(
      item,
      () => commands.setItemFlags(item.id, {
        pinned: null,
        favorite: null,
        archived: true,
      }),
      () => removeItem(item),
    );
  }

  function duplicateItem(item: LibraryItem) {
    void runItemAction(item, () => commands.duplicateItem(item.id), (duplicate) => {
      focusTarget.current = `snippet-item-${duplicate.id}`;
      updateLibrary((items) => [duplicate, ...items], 1);
      setSelectedId(duplicate.id);
    });
  }

  function deleteItem(item: LibraryItem) {
    if (undoReceipt) return;
    void runItemAction(item, () => commands.deleteItem(item.id), (receipt) => {
      removeItem(item);
      setUndoReceipt(receipt);
    });
  }

  async function undoDelete() {
    if (!undoReceipt) return;
    setUndoBusy(true);
    setActionError("");
    try {
      const restored = await commands.restoreItem(undoReceipt.id);
      focusTarget.current = `snippet-item-${restored.id}`;
      updateLibrary((items) => [restored, ...items], 1);
      setSelectedId(restored.id);
      setUndoReceipt(null);
      setActionMessage("Item restored");
    } catch {
      setActionError("Undo expired or could not be completed.");
      setUndoReceipt(null);
    } finally {
      setUndoBusy(false);
    }
  }

  async function loadMore() {
    if (loadingMore || library.status !== "ready") return;
    setLoadingMore(true);
    setActionError("");
    try {
      const result = await commands.searchItems({
        ...snippetQuery,
        offset: library.items.length,
      });
      setLibrary((current) => current.status === "ready"
        ? {
            ...current,
            items: [...current.items, ...result.items],
            total: result.total,
          }
        : current);
    } catch {
      setActionError("Could not load more library items.");
    } finally {
      setLoadingMore(false);
    }
  }

  function openEditor(item: LibraryItem | null, returnFocusId: string) {
    editorReturnFocus.current = returnFocusId;
    focusTarget.current = "workspace-title";
    setEditing(item);
  }

  function closeEditor() {
    focusTarget.current = editorReturnFocus.current;
    setEditing(false);
  }

  function saveItem(item: LibraryItem) {
    const exists = library.items.some((current) => current.id === item.id);
    updateLibrary(
      (items) => exists
        ? items.map((current) => current.id === item.id ? item : current)
        : [item, ...items],
      exists ? 0 : 1,
    );
    setSelectedId(item.id);
    closeEditor();
  }

  function selectByKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(index + 1, library.items.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = library.items.length - 1;
    else return;

    event.preventDefault();
    const item = library.items[next];
    if (!item) return;
    setSelectedId(item.id);
    document.getElementById(`snippet-item-${item.id}`)?.focus();
  }

  if (editing !== false) {
    return (
      <main className="workspace-content">
        <SnippetEditor
          item={editing}
          onSaved={saveItem}
          onCancel={closeEditor}
        />
      </main>
    );
  }

  return (
    <main className="workspace-content">
      <header className="content-heading snippet-heading">
        <div>
          <p>Snippet library</p>
          <h2 id="workspace-title" tabIndex={-1}>Reusable content</h2>
        </div>
        <div className="snippet-heading__actions">
          <button
            id="new-snippet"
            className="button-primary"
            type="button"
            onClick={() => openEditor(null, "new-snippet")}
          >
            New snippet
          </button>
          <span className="item-count">
            {library.total} {library.total === 1 ? "item" : "items"}
          </span>
        </div>
      </header>
      <div className="sr-only" aria-live="polite">{actionMessage}</div>
      {actionError && <p className="action-error" role="alert">{actionError}</p>}
      <section
        className={library.status === "ready" && library.items.length > 0
          ? "content-panel snippet-panel has-items"
          : "content-panel snippet-panel"}
        aria-label="Snippet library"
      >
        {library.status === "loading" && (
          <div className="content-state" role="status" aria-busy="true">
            <span className="loading-ring" aria-hidden="true" />
            <p>Loading snippets...</p>
          </div>
        )}
        {library.status === "error" && (
          <div className="content-state" role="alert">
            <span className="state-mark" aria-hidden="true">!</span>
            <div>
              <h3>Snippet library unavailable</h3>
              <p>Close and reopen SnipDock to try again.</p>
            </div>
          </div>
        )}
        {library.status === "ready" && library.items.length === 0 && (
          <div className="content-state" role="status">
            <div>
              <h3>No snippets yet</h3>
              <p>Create reusable text, commands, templates, and notes.</p>
            </div>
          </div>
        )}
        {library.status === "ready" && library.items.length > 0 && (
          <div className="snippet-layout">
            <div className="snippet-list">
              <div className="snippet-list__items" role="listbox" aria-label="Reusable items">
                {library.items.map((item, index) => (
                <button
                  id={`snippet-item-${item.id}`}
                  className="snippet-list__item"
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  tabIndex={item.id === selectedId ? 0 : -1}
                  onClick={() => setSelectedId(item.id)}
                  onFocus={() => setSelectedId(item.id)}
                  onKeyDown={(event) => selectByKeyboard(event, index)}
                  key={item.id}
                >
                  <span className="snippet-list__title">{itemTitle(item)}</span>
                  <span className="snippet-list__meta">
                    {item.kind} - Used {item.usage_count}
                  </span>
                </button>
                ))}
              </div>
              {library.items.length < library.total && (
                <button
                  className="snippet-list__more"
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
            {selected && (
              <SnippetDetail
                item={selected}
                busy={selected.id === busyId}
                destructiveDisabled={undoReceipt !== null}
                onCopy={() => copyItem(selected)}
                onTogglePin={() => setFlags(selected, {
                  pinned: !selected.pinned,
                  favorite: null,
                  archived: null,
                })}
                onToggleFavorite={() => setFlags(selected, {
                  pinned: null,
                  favorite: !selected.favorite,
                  archived: null,
                })}
                onEdit={() => openEditor(
                  selected,
                  `item-actions-trigger-${selected.id}`,
                )}
                onDuplicate={() => duplicateItem(selected)}
                onArchive={() => archiveItem(selected)}
                onDelete={() => deleteItem(selected)}
              />
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
