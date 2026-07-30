import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { commands } from "../../api/commands";
import ItemThumbnail from "../../components/ItemThumbnail";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { LibraryItem, SearchQuery } from "../../api/types";

const quickPasteQuery: SearchQuery = {
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
  limit: 50,
  offset: 0,
};

function itemLabel(item: LibraryItem) {
  if (item.title?.trim()) return item.title.trim();
  // An image item's content is a file path, which is meaningless as a label.
  if (item.content_type === "image") return "Image";
  return item.content.split(/\r?\n/, 1)[0]?.trim() || "Empty item";
}

function capturedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function QuickPastePage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [directPasteSupported, setDirectPasteSupported] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const requestId = useRef(0);

  const loadItems = useCallback(async (text: string) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await commands.searchItems({
        ...quickPasteQuery,
        text: text.trim() || null,
      });
      if (id !== requestId.current) return;
      setItems(result.items);
      setSelectedId(result.items[0]?.id ?? null);
      setError("");
    } catch {
      if (id !== requestId.current) return;
      setItems([]);
      setSelectedId(null);
      setError("Could not load clipboard history.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems(query);
  }, [loadItems, query]);

  useEffect(() => {
    void commands.directPasteSupported().then(setDirectPasteSupported, () => setDirectPasteSupported(false));
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void getCurrentWindow().hide();
    }
    document.addEventListener("keydown", onEscape, { capture: true });
    return () => document.removeEventListener("keydown", onEscape, { capture: true });
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listenEvent<void>(ShortcutEvents.open, () => {
      setQuery("");
      setError("");
      void loadItems("");
      requestAnimationFrame(() => input.current?.focus());
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch(() => setError("Quick Paste shortcut listener unavailable."));
    return () => {
      active = false;
      unlisten?.();
    };
  }, [loadItems]);

  const moveSelection = useCallback((direction: "next" | "previous" | "first" | "last") => {
    if (!items.length) return;
    const current = Math.max(0, items.findIndex((item) => item.id === selectedId));
    const index = direction === "first"
      ? 0
      : direction === "last"
        ? items.length - 1
        : direction === "next"
          ? Math.min(current + 1, items.length - 1)
          : Math.max(current - 1, 0);
    const item = items[index];
    if (!item) return;
    setSelectedId(item.id);
    itemRefs.current.get(item.id)?.scrollIntoView({ block: "nearest" });
  }, [items, selectedId]);

  const pasteItem = useCallback(async (item: LibraryItem) => {
    if (busy || directPasteSupported === null) return;
    setBusy(true);
    setError("");
    try {
      if (directPasteSupported) {
        await commands.directPaste(item.id);
      } else {
        await commands.copyItem(item.id, "raw");
        await getCurrentWindow().hide();
      }
    } catch {
      setError(directPasteSupported
        ? "Paste failed. Keep the target editor open, then try again."
        : "Copy failed. Try again.");
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [busy, directPasteSupported]);

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveSelection(
        event.key === "ArrowDown"
          ? "next"
          : event.key === "ArrowUp"
            ? "previous"
            : event.key === "Home"
              ? "first"
              : "last",
      );
      return;
    }
    if (event.key === "Enter") {
      const item = items.find((entry) => entry.id === selectedId);
      if (item) {
        event.preventDefault();
        void pasteItem(item);
      }
    }
  }

  return (
    <main
      className="flex h-screen min-h-0 flex-col overflow-hidden border border-border bg-background text-foreground shadow-[var(--shadow-panel)]"
      onKeyDown={handleKeyDown}
    >
      <header className="border-b border-border bg-card px-4 pb-3 pt-4" data-tauri-drag-region>
        <div className="mb-3 flex items-center justify-between gap-4" data-tauri-drag-region>
          <div data-tauri-drag-region>
            <p className="m-0 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-primary">SnipDock</p>
            <h1 className="m-0 font-display text-base font-semibold tracking-[-0.02em]" data-tauri-drag-region>Quick Paste</h1>
          </div>
          <button
            className="rounded-sm px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            type="button"
            aria-label="Close Quick Paste"
            onClick={() => void getCurrentWindow().hide()}
          >
            Esc
          </button>
        </div>
        <input
          ref={input}
          className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm outline-none placeholder:text-[var(--color-text-subtle)] focus:border-primary focus:ring-2 focus:ring-primary/20"
          type="search"
          value={query}
          autoFocus
          placeholder="Search clipboard history"
          aria-label="Search clipboard history"
          aria-controls="quick-paste-results"
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>

      {error && <p className="m-0 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">{error}</p>}

      <section className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Clipboard results">
        {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Loading history...</p>}
        {!loading && !error && items.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">No matching clipboard items.</p>
        )}
        {!loading && items.length > 0 && (
          <div id="quick-paste-results" role="listbox" aria-label="Clipboard history">
            {items.map((item) => {
              const selected = item.id === selectedId;
              return (
                <button
                  ref={(element) => {
                    if (element) itemRefs.current.set(item.id, element);
                    else itemRefs.current.delete(item.id);
                  }}
                  className="relative mb-1 block w-full rounded-sm border border-transparent px-3 py-2.5 text-left hover:bg-muted aria-selected:border-border aria-selected:bg-muted aria-selected:before:absolute aria-selected:before:inset-y-2 aria-selected:before:left-0 aria-selected:before:w-0.5 aria-selected:before:rounded-full aria-selected:before:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:opacity-60"
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={busy || directPasteSupported === null}
                  onMouseMove={() => setSelectedId(item.id)}
                  onFocus={() => setSelectedId(item.id)}
                  onClick={() => void pasteItem(item)}
                  key={item.id}
                >
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{itemLabel(item)}</span>
                    <time className="shrink-0 font-mono text-[0.65rem] text-[var(--color-text-subtle)]" dateTime={item.created_at}>{capturedTime(item.created_at)}</time>
                  </span>
                  {item.content_type === "image"
                    ? <ItemThumbnail item={item} className="mt-1 max-h-16" />
                    : <span className="mt-1 line-clamp-2 whitespace-pre-wrap font-mono text-[0.72rem] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{item.content}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <footer className="flex justify-between border-t border-border bg-card px-4 py-2 font-mono text-[0.65rem] text-[var(--color-text-subtle)]">
        <span>↑↓ Navigate</span>
        <span>{directPasteSupported === null
          ? "Checking paste support…"
          : directPasteSupported
            ? "Enter Paste"
            : "Enter copies, then paste manually"}</span>
      </footer>
    </main>
  );
}
