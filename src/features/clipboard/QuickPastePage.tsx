import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CommandError, commands } from "../../api/commands";
import ItemThumbnail from "../../components/ItemThumbnail";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { LibraryItem, Transform } from "../../api/types";
import { clipboardQuery } from "../../lib/searchQuery";
import {
  applyTransform,
  TRANSFORM_KINDS,
  TRANSFORM_BY_SHORTCUT,
} from "../../lib/transforms";
import { useClipboardStore } from "../../stores/clipboardStore";
import SearchModeToggle from "./SearchModeToggle";
import { cn } from "@/lib/utils";

const quickPasteQuery = clipboardQuery({ limit: 50 });

/** `Backspace` clears the active transform. `Tab` cycles forward; Shift+Tab
 *  cycles backward. Everything else comes from each chip's `shortcut`. */
const RESET_KEY = "Backspace";

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

type PreviewState =
  | { status: "idle"; content: string }
  | { status: "active"; content: string; transform: Transform }
  | { status: "error"; transform: Transform; message: string };

function computePreview(
  item: LibraryItem | null,
  transform: Transform | null,
): PreviewState {
  if (!item) return { status: "idle", content: "" };
  if (item.content_type === "image") return { status: "idle", content: "" };
  if (transform === null) return { status: "idle", content: item.content };
  try {
    return {
      status: "active",
      content: applyTransform(item.content, transform),
      transform,
    };
  } catch (error) {
    return {
      status: "error",
      transform,
      message: error instanceof Error ? error.message : "transform failed",
    };
  }
}

export default function QuickPastePage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [directPasteSupported, setDirectPasteSupported] = useState<boolean | null>(null);
  const [activeTransform, setActiveTransform] = useState<Transform | null>(null);
  const [previewOverride, setPreviewOverride] = useState<string | null>(null);
  const searchMode = useClipboardStore((state) => state.searchMode);
  const setSearchMode = useClipboardStore((state) => state.setSearchMode);
  // The last query the user confirmed by typing; Dismiss restores this.
  const lastValidQuery = useRef<string>("");
  // An invalid_regex typed error holds the prior results on screen until the
  // user dismisses it, per the spec.
  const [regexError, setRegexError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const requestId = useRef(0);
  // Track the last item the transform was set against so a re-render with
  // the same selection (e.g. loading state) does not silently drop it.
  const lastTransformedItem = useRef<string | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  // The active transform is a per-selection setting: switching rows clears
  // it so the next preview is the un-transformed content.
  useEffect(() => {
    if (lastTransformedItem.current !== null && lastTransformedItem.current !== selectedId) {
      setActiveTransform(null);
      setPreviewOverride(null);
    }
    lastTransformedItem.current = selectedId;
  }, [selectedId]);

  const preview = useMemo(
    () => computePreview(selected, activeTransform),
    [selected, activeTransform],
  );
  const previewText = previewOverride ?? (preview.status === "idle" || preview.status === "active" ? preview.content : "");

  const isImage = selected?.content_type === "image";
  const transformsEnabled = !isImage && selected !== null;

  const loadItems = useCallback(async (text: string) => {
    const id = ++requestId.current;
    setLoading(true);
    // In regex mode the `text` field stays null - the FTS5 pre-filter
    // should not run when the user opted into a raw regex pattern. The
    // backend still uses the FTS5 pre-filter as a candidate set, but
    // only when `text` is present; the regex itself drives the match.
    const trimmed = text.trim();
    const isRegex = useClipboardStore.getState().searchMode === "regex";
    const request = {
      ...quickPasteQuery,
      text: !isRegex && trimmed ? trimmed : null,
      regex: isRegex && trimmed ? trimmed : null,
      // The Rust pipeline also reads `(?i)` from inside the pattern, so
      // the explicit flag stays opt-in. A null here is the same as absent.
      regex_case_insensitive: null,
    };
    try {
      const result = await commands.searchItems(request);
      if (id !== requestId.current) return;
      setItems(result.items);
      setSelectedId(result.items[0]?.id ?? null);
      setError("");
      setRegexError("");
      lastValidQuery.current = text;
    } catch (cause) {
      if (id !== requestId.current) return;
      // An invalid regex pattern is its own inline message; everything else
      // is the same generic failure the page has always shown.
      if (cause instanceof CommandError && cause.code === "invalid_regex") {
        setRegexError(cause.message);
        return;
      }
      setItems([]);
      setSelectedId(null);
      setError("Could not load clipboard history.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems(query);
  }, [loadItems, query, searchMode]);

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
      setRegexError("");
      setActiveTransform(null);
      setPreviewOverride(null);
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
        await commands.directPaste(item.id, activeTransform);
      } else {
        await commands.copyItem(item.id, "raw", activeTransform);
        await getCurrentWindow().hide();
      }
    } catch (error) {
      setError(directPasteSupported
        ? error instanceof Error && error.message
          ? `Paste failed: ${error.message}`
          : "Paste failed. Keep the target editor open, then try again."
        : error instanceof Error && error.message
          ? `Copy failed: ${error.message}`
          : "Copy failed. Try again.");
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [busy, directPasteSupported, activeTransform]);

  function cycleTransform(direction: 1 | -1) {
    if (!transformsEnabled) return;
    setError("");
    setPreviewOverride(null);
    const total = TRANSFORM_KINDS.length;
    const currentIndex = activeTransform === null
      ? -1
      : TRANSFORM_KINDS.findIndex((kind) => kind.variant === activeTransform);
    const next = (currentIndex + direction + total) % total;
    setActiveTransform(TRANSFORM_KINDS[next].variant);
  }

  function setTransformVariant(variant: Transform) {
    if (!transformsEnabled) return;
    setError("");
    setPreviewOverride(null);
    setActiveTransform(variant);
  }

  function clearTransform() {
    if (!transformsEnabled) return;
    setError("");
    setPreviewOverride(null);
    setActiveTransform(null);
  }

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
      return;
    }
    // `Tab` cycles the transform row; `Shift+Tab` cycles the other way and
    // is also the only way the browser does not steal focus before the
    // transform row sees the key.
    if (event.key === "Tab") {
      if (!transformsEnabled) return;
      event.preventDefault();
      cycleTransform(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === RESET_KEY && activeTransform !== null) {
      event.preventDefault();
      clearTransform();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey && !event.altKey && !event.metaKey &&
      transformsEnabled
    ) {
      const kind = TRANSFORM_BY_SHORTCUT.get(event.key.toUpperCase());
      if (kind) {
        event.preventDefault();
        setTransformVariant(kind.variant);
        return;
      }
    }
    // 1-9 paste the numbered row outright. The search box has focus, so this
    // only fires with a modifier held - otherwise typing a digit into the
    // query would fire off a paste instead of filtering.
    if (/^[1-9]$/.test(event.key) && (event.altKey || event.ctrlKey || event.metaKey)) {
      const item = items[Number(event.key) - 1];
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
        <div className="flex items-center gap-2">
          <input
            ref={input}
            className={cn(
              "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none placeholder:text-[var(--color-text-subtle)] focus:ring-2 focus:ring-primary/20",
              searchMode === "regex"
                ? "border-primary/60 focus:border-primary"
                : "border-border-strong focus:border-primary",
            )}
            type="search"
            value={query}
            autoFocus
            placeholder={searchMode === "regex" ? "Regex pattern" : "Search clipboard history"}
            aria-label="Search clipboard history"
            aria-controls="quick-paste-results"
            onChange={(event) => setQuery(event.target.value)}
          />
          <SearchModeToggle
            value={searchMode}
            onChange={setSearchMode}
            size="sm"
          />
        </div>
        {searchMode === "regex" && (
          <p className="mt-2 m-0 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-primary">
            Regex
          </p>
        )}
      </header>

      {regexError && (
        <div
          className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          role="alert"
        >
          <span className="flex-1 leading-snug">
            <span className="font-semibold">Invalid regex:</span> {regexError}
          </span>
          <button
            type="button"
            className="rounded-sm border border-destructive/30 bg-card px-2 py-1 text-[0.7rem] font-semibold text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
            onClick={() => {
              setRegexError("");
              // Restoring the last good query keeps the rows the user was
              // looking at visible while the error clears.
              setQuery(lastValidQuery.current);
              setSearchMode("literal");
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && !regexError && <p className="m-0 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">{error}</p>}

      <div
        className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card/60 px-2 py-1.5"
        role="toolbar"
        aria-label="Quick Paste transforms"
      >
        <span className="px-1 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
          Transform
        </span>
        {TRANSFORM_KINDS.map((kind) => {
          const active = kind.variant === activeTransform;
          return (
            <button
              key={kind.variant}
              type="button"
              disabled={!transformsEnabled}
              aria-pressed={active}
              title={`${kind.label} — ${kind.hint}${kind.shortcut ? ` (${kind.shortcut})` : ""}`}
              onClick={() => setTransformVariant(kind.variant)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-[0.7rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {kind.shortcut && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-sm font-mono text-[0.6rem] font-bold leading-none",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-[var(--color-text-subtle)]",
                  )}
                >
                  {kind.shortcut}
                </span>
              )}
              <span>{kind.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          disabled={!transformsEnabled || activeTransform === null}
          onClick={clearTransform}
          className="ml-auto shrink-0 rounded-sm border border-border bg-card px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          None (⌫)
        </button>
      </div>

      {selected && !isImage && (
        <section
          aria-label="Transform preview"
          className="border-b border-border bg-background/60 px-4 py-2"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
              Preview
            </span>
            {activeTransform && (
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-primary">
                {TRANSFORM_KINDS.find((kind) => kind.variant === activeTransform)?.label}
              </span>
            )}
            {previewOverride !== null && (
              <button
                type="button"
                className="ml-auto font-mono text-[0.6rem] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setPreviewOverride(null)}
              >
                Revert
              </button>
            )}
          </div>
          {preview.status === "error" ? (
            <p className="m-0 font-mono text-[0.7rem] text-destructive" role="alert">
              {preview.message}
            </p>
          ) : preview.status === "active" ? (
            <pre
              className="m-0 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[0.72rem] leading-relaxed text-foreground [overflow-wrap:anywhere]"
              data-testid="transform-preview"
            >
              {previewText || "(empty)"}
            </pre>
          ) : (
            <p className="m-0 font-mono text-[0.7rem] text-muted-foreground">
              No transform selected. Press <span className="rounded-sm bg-muted px-1 py-px text-foreground">Tab</span> to cycle or a single-letter key to pick one.
            </p>
          )}
        </section>
      )}

      {selected && isImage && (
        <p
          className="border-b border-border bg-background/60 px-4 py-2 text-center font-mono text-[0.68rem] text-muted-foreground"
          role="status"
        >
          Image items have no transforms
        </p>
      )}

      <section className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Clipboard results">
        {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Loading history...</p>}
        {!loading && !error && items.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">No matching clipboard items.</p>
        )}
        {!loading && items.length > 0 && (
          <div id="quick-paste-results" role="listbox" aria-label="Clipboard history">
            {items.map((item, index) => {
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
                    {index < 9 && (
                      <span
                        aria-hidden="true"
                        className="grid size-4 shrink-0 place-items-center rounded-sm border border-border font-mono text-[0.6rem] text-[var(--color-text-subtle)]"
                      >
                        {index + 1}
                      </span>
                    )}
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

      <footer className="flex justify-between gap-4 border-t border-border bg-card px-4 py-2 font-mono text-[0.65rem] text-[var(--color-text-subtle)]">
        <span>↑↓ Navigate · Ctrl 1-9 Paste</span>
        <span>{directPasteSupported === null
          ? "Checking paste support…"
          : directPasteSupported
            ? `Enter Paste${activeTransform ? ` (${TRANSFORM_KINDS.find((kind) => kind.variant === activeTransform)?.label})` : ""}`
            : "Enter copies, then paste manually"}</span>
      </footer>
    </main>
  );
}
