import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CommandError, commands } from "../../api/commands";
import Highlight, { highlightTerms } from "../../components/Highlight";
import ItemThumbnail from "../../components/ItemThumbnail";
import TypeTile from "../../components/TypeTile";
import CodeView from "../../components/CodeView";
import { matchExcerpt } from "./normalizePreview";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { LibraryItem, PasteFormat, Transform } from "../../api/types";
import { clipboardQuery } from "../../lib/searchQuery";
import {
  applyTransform,
  TRANSFORM_KINDS,
  TRANSFORM_BY_SHORTCUT,
} from "../../lib/transforms";
import { useClipboardStore } from "../../stores/clipboardStore";
import SearchModeToggle from "./SearchModeToggle";
import { KeyCap, KeyCombo } from "@/components/ui/key-cap";
import { formatBinding, isMac, parseBinding, SHORTCUT_SCHEMA } from "../../lib/shortcuts";
import {
  displayTypeLabel,
  isCodeShaped,
  typeGlyph,
} from "../../lib/contentTypeColors";
import { cn } from "@/lib/utils";

const quickPasteQuery = clipboardQuery({ limit: 50 });

const PASTE_FORMAT_LABELS: Record<PasteFormat, string> = {
  preserve: "Preserve original",
  plain_text: "Plain text",
  strip_whitespace: "Strip extra whitespace",
};

/** `Alt+Backspace` clears the active transform. `F8` cycles forward;
 *  `Shift+F8` cycles backward. The per-chip letters come from each chip's
 *  `shortcut` and are pressed with `Alt` held: the search box has focus the
 *  whole time Quick Paste is open, so a bare letter belongs in the query -
 *  the same reason the numbered rows need a modifier. */
const RESET_KEY = "Backspace";
/** What the transform modifier is called here. The handler checks `altKey`,
 *  which macOS labels Option. */
const transformModifier = isMac() ? "Option" : "Alt";
const CYCLE_NEXT_KEY = "F8";
const CYCLE_PREV_KEY = "F8";

function itemLabel(item: LibraryItem, terms: string[]) {
  if (item.title?.trim()) return item.title.trim();
  // An image item's content is a file path, which is meaningless as a label.
  if (item.content_type === "image") return "Image";
  // The first line alone was a lone "{" for pretty JSON - the default
  // selection, identifying nothing - and, while searching, a line without the
  // match on it whenever the match was further down. See matchExcerpt.
  return matchExcerpt(item.content, item.content_type, terms, 1).split("\n", 1)[0]?.trim() || "Empty item";
}

/** The binding actually in force for an action: the user's override where one
 *  is stored, the documented default otherwise. Reading only the default was
 *  the very failure the empty state exists to avoid - after a rebind it went
 *  on advertising a combination the app no longer listens for. */
function bindingFor(
  actionId: string,
  overrides: Record<string, string> = {},
): string | null {
  const entry = SHORTCUT_SCHEMA.find((candidate) => candidate.actionId === actionId);
  if (!entry) return null;
  const raw = overrides[actionId]?.trim() || entry.defaultBinding;
  const parsed = parseBinding(raw);
  return parsed.ok ? formatBinding(parsed.value, isMac()) : raw;
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
  // The bindings the user has rebound, so the empty state can name the
  // combination that actually opens this window.
  const [shortcutOverrides, setShortcutOverrides] = useState<Record<string, string>>({});
  const [pasteFormat, setPasteFormat] = useState<PasteFormat>("preserve");
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
  const matchTerms = useMemo(() => highlightTerms(query, searchMode), [query, searchMode]);

  useEffect(() => {
    let active = true;
    void commands
      .getSettings()
      .then((settings) => {
        if (active && settings?.custom_shortcuts) setShortcutOverrides(settings.custom_shortcuts);
        if (active && settings?.paste_format) setPasteFormat(settings.paste_format);
      })
      .catch(() => {
        // The documented defaults are the right fallback: they are what the
        // app registers when nothing is stored.
      });
    return () => {
      active = false;
    };
  }, []);

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
    // `F8` cycles the transform row; `Shift+F8` cycles the other way and
    // preserves normal Tab focus navigation across descendant controls.
    if (event.key === CYCLE_NEXT_KEY || (event.key === CYCLE_PREV_KEY && event.shiftKey)) {
      if (!transformsEnabled) return;
      event.preventDefault();
      cycleTransform(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === RESET_KEY && event.altKey && activeTransform !== null) {
      event.preventDefault();
      clearTransform();
      return;
    }
    if (
      event.key.length === 1 &&
      event.altKey && !event.ctrlKey && !event.metaKey &&
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

  const activeKind = TRANSFORM_KINDS.find((kind) => kind.variant === activeTransform);
  const pasteFormatLabel = PASTE_FORMAT_LABELS[pasteFormat] ?? "Preserve original";
  const selectedLines = selected && !isImage ? selected.content.split("\n").length : 0;

  return (
    <main
      className="flex h-screen min-h-0 flex-col overflow-hidden border border-border bg-background text-foreground shadow-[var(--shadow-panel)]"
      onKeyDown={handleKeyDown}
    >
      {/* The header is also the window's drag handle - Quick Paste has no
          title bar - so it keeps a title line to grab. */}
      <header className="grid gap-3 px-4 pb-3 pt-3.5" data-tauri-drag-region>
        <div className="flex items-center gap-2.5" data-tauri-drag-region>
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-primary text-primary-foreground" data-tauri-drag-region>
            <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
              <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
            </svg>
          </span>
          <h1 className="m-0 font-display text-[0.9rem] font-extrabold" data-tauri-drag-region>
            Quick Paste
          </h1>
          {/* Where Enter sends the capture, said before it is pressed. */}
          <span className="text-[0.74rem] text-[var(--text-muted)]" data-tauri-drag-region>
            {directPasteSupported === false ? "copies to the clipboard" : "pastes where you were"}
          </span>
          <span className="flex-1" data-tauri-drag-region />
          <button
            className="flex items-center gap-1.5 rounded-[7px] px-1.5 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            type="button"
            aria-label="Close Quick Paste"
            onClick={() => void getCurrentWindow().hide()}
          >
            <KeyCap>Esc</KeyCap>
            close
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <label
            className={cn(
              "flex h-[42px] min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-[11px] border bg-card pl-3 pr-2.5 transition-[border-color,box-shadow] duration-100 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]",
              searchMode === "regex"
                ? "border-primary/60 focus-within:border-primary"
                : "border-border focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]",
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-current text-[var(--text-muted)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={input}
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] outline-none placeholder:text-[var(--text-muted)] [&::-webkit-search-cancel-button]:appearance-none"
              type="search"
              value={query}
              autoFocus
              placeholder={searchMode === "regex" ? "Regex pattern" : "Search clipboard history"}
              aria-label="Search clipboard history"
              aria-controls="quick-paste-results"
              onChange={(event) => setQuery(event.target.value)}
            />
            {items.length > 0 && (
              <span className="shrink-0 font-mono text-[0.66rem] tabular-nums text-[var(--text-muted)]">
                {Math.max(0, items.findIndex((entry) => entry.id === selectedId)) + 1} of {items.length}
              </span>
            )}
          </label>
          <SearchModeToggle
            value={searchMode}
            onChange={setSearchMode}
            size="sm"
          />
        </div>
        {searchMode === "regex" && (
          <p className="m-0 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-primary">
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
        className="flex items-center gap-1.5 overflow-x-auto border-y border-border bg-[color-mix(in_srgb,var(--surface-1)_55%,var(--page))] px-4 py-2"
        role="toolbar"
        aria-label="Quick Paste transforms"
      >
        <span className="flex shrink-0 items-center gap-2 pr-1 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Transform
          {/* The letters on the chips are pressed with this held: focus stays
              in the search box, so a bare letter types into the query. Said
              once for the row, not on all ten chips. */}
          <span
            data-testid="transform-modifier"
            className="rounded-[5px] border border-b-2 border-border bg-background px-1.5 py-px normal-case tracking-normal text-muted-foreground"
          >
            {transformModifier}+
          </span>
        </span>
        {TRANSFORM_KINDS.map((kind) => {
          const active = kind.variant === activeTransform;
          return (
            <button
              key={kind.variant}
              type="button"
              disabled={!transformsEnabled}
              aria-pressed={active}
              title={`${kind.label} — ${kind.hint}${kind.shortcut ? ` (Alt+${kind.shortcut})` : ""}`}
              onClick={() => setTransformVariant(kind.variant)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border pl-1 pr-2.5 text-[0.74rem] font-medium transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]"
                  : "border-border text-muted-foreground hover:border-[var(--border-strong)] hover:text-foreground",
              )}
            >
              {kind.shortcut && (
                <span
                  aria-hidden="true"
                  className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-[5px] border border-b-2 border-border bg-background font-mono text-[0.6rem] font-medium leading-none text-muted-foreground"
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
          className="ml-auto h-7 shrink-0 rounded-lg border border-border px-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          None (⌫)
        </button>
      </div>

      {/* The list and, beside it, the selected capture in full: what Enter
          will paste, seen before it is pressed. Below 40rem the pane gives
          the width back to the list. */}
      <div className="grid min-h-0 flex-1 grid-cols-[23rem_minmax(0,1fr)] max-[40rem]:grid-cols-1">
      <section className="min-h-0 overflow-y-auto p-2" aria-label="Clipboard results">
        {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Loading history...</p>}
        {!loading && !error && items.length === 0 && query.trim() !== "" && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">No matching clipboard items.</p>
        )}
        {/* Nothing stored at all is a different situation from nothing
            matching, and it is the one moment where the shortcuts are worth
            teaching. */}
        {!loading && !error && items.length === 0 && query.trim() === "" && (
          <div className="grid justify-items-center gap-3 p-10 text-center" role="status">
            <span
              aria-hidden="true"
              className="grid size-14 place-items-center rounded-[16px] border border-[color-mix(in_srgb,var(--accent-ink)_28%,transparent)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]"
            >
              <svg viewBox="0 0 24 24" className="size-7 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
                <path d="M9.25 3.5h5.5v2.75h-5.5z" />
                <path d="M9.25 4.9H7.5v14.6h9V4.9h-1.75" />
              </svg>
            </span>
            <h2 className="m-0 text-[1.3rem] font-semibold tracking-[-0.018em]">Nothing captured yet</h2>
            <p className="m-0 max-w-[380px] text-[0.81rem] leading-[1.6] text-[var(--text-muted)] [text-wrap:pretty]">
              Copy something anywhere on this computer and it lands here, ready to paste back
              without leaving the keyboard.
            </p>
            <div className="mt-4 grid gap-2 text-[0.68rem] text-[var(--text-muted)]">
              {[
                { id: "open_quick_paste", what: "quick paste" },
                { id: "focus_main_window_search", what: "search the history" },
              ].map(({ id, what }) => {
                const binding = bindingFor(id, shortcutOverrides);
                if (!binding) return null;
                return (
                  <span key={id} className="flex items-center justify-center gap-1.5">
                    <KeyCombo binding={binding} /> {what}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {!loading && items.length > 0 && (
          <div id="quick-paste-results" role="listbox" aria-label="Clipboard history" className="grid gap-0.5">
            {items.map((item, index) => {
              const selected = item.id === selectedId;
              return (
                <button
                  ref={(element) => {
                    if (element) itemRefs.current.set(item.id, element);
                    else itemRefs.current.delete(item.id);
                  }}
                  className="group relative flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors duration-100 hover:bg-card aria-selected:bg-[var(--accent-subtle)] aria-selected:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:opacity-60"
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={busy || directPasteSupported === null}
                  onMouseMove={() => setSelectedId(item.id)}
                  onFocus={() => setSelectedId(item.id)}
                  onClick={() => void pasteItem(item)}
                  key={item.id}
                >
                  {/* The same tile the history rows carry, so a row means the
                      same thing in both. An image shows itself instead. */}
                  {item.content_type === "image" ? (
                    <ItemThumbnail item={item} className="mt-0 h-7 w-10 shrink-0 rounded-[6px] object-cover" />
                  ) : (
                    <TypeTile item={item} size="sm" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-foreground",
                        isCodeShaped(item.content_type) ? "font-mono text-[0.78rem]" : "font-sans text-[0.84rem]",
                      )}
                    >
                      <Highlight text={itemLabel(item, matchTerms)} terms={matchTerms} selected={selected} />
                    </span>
                    {/* Every row carries the same caption, images included -
                        they had none. The thumbnail already says "image", so
                        the type is not repeated there. */}
                    <span className="mt-0.5 block truncate text-[0.7rem] text-[var(--text-muted)]">
                      {item.content_type === "image" ? "" : `${displayTypeLabel(item)} · `}
                      {capturedTime(item.created_at)}
                      {item.source_app ? ` · ${item.source_app}` : ""}
                    </span>
                  </span>
                  {index < 9 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-5 min-w-5 shrink-0 place-items-center rounded-[5px] border px-1 font-mono text-[0.62rem] font-medium",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border border-b-2 bg-background text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <section
          // Named for what it is showing: the capture, or - with a transform
          // on - what the transform makes of it.
          aria-label={activeTransform ? "Transform preview" : "Selected capture"}
          className="flex min-h-0 flex-col border-l border-border bg-[color-mix(in_srgb,var(--surface-1)_45%,var(--page))] max-[40rem]:hidden"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span
              className="rounded-[6px] px-1.5 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.05em]"
              style={{
                color: `var(--type-${typeGlyph(selected).token})`,
                background: `color-mix(in srgb, var(--type-${typeGlyph(selected).token}) 14%, transparent)`,
              }}
            >
              {displayTypeLabel(selected)}
            </span>
            <span className="min-w-0 truncate font-mono text-[0.66rem] text-[var(--text-muted)]">
              {isImage
                ? selected.source_app ?? ""
                : `${selectedLines > 1 ? `${selectedLines} lines · ` : ""}${selected.content.length.toLocaleString()} chars${selected.source_app ? ` · ${selected.source_app}` : ""}`}
            </span>
            <span className="flex-1" />
            {activeKind && (
              <span className="animate-[fade-in_160ms_ease-out] rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[0.66rem] font-bold text-[var(--accent-ink)] motion-reduce:animate-none">
                {activeKind.label}
              </span>
            )}
            {previewOverride !== null && (
              <button
                type="button"
                className="font-mono text-[0.6rem] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setPreviewOverride(null)}
              >
                Revert
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {isImage ? (
              <>
                <div className="overflow-hidden rounded-[10px] border border-border bg-white">
                  <ItemThumbnail item={selected} variant="full" className="mt-0 block max-h-none w-full max-w-full rounded-none border-0" />
                </div>
                <p className="m-0 mt-3 text-center font-mono text-[0.68rem] text-muted-foreground" role="status">
                  Image items have no transforms
                </p>
              </>
            ) : selected.private ? (
              <p className="m-0 rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] p-3.5 text-[0.78rem] leading-relaxed text-muted-foreground">
                Hidden because it looks like a secret. Enter still pastes it.
              </p>
            ) : preview.status === "error" ? (
              <p className="m-0 rounded-[9px] border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-[0.7rem] text-destructive" role="alert">
                {preview.message}
              </p>
            ) : isCodeShaped(selected.content_type) ? (
              <CodeView
                content={previewText}
                contentType={selected.content_type}
                textTestId={activeTransform ? "transform-preview" : undefined}
              />
            ) : (
              <pre
                className="m-0 whitespace-pre-wrap font-sans text-[0.86rem] leading-[1.65] text-foreground [overflow-wrap:anywhere]"
                data-testid={activeTransform ? "transform-preview" : undefined}
              >
                {previewText || "(empty)"}
              </pre>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[0.74rem] text-[var(--text-muted)]">
            Paste as
            <span className="font-semibold text-foreground">{pasteFormatLabel}</span>
            <span className="flex-1" />
            <button
              type="button"
              disabled={busy || directPasteSupported === null}
              onClick={() => void pasteItem(selected)}
              className="inline-flex h-[30px] items-center gap-2 rounded-lg bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/14%),inset_0_1px_0_rgb(255_255_255/12%)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {directPasteSupported === false ? "Copy" : "Paste"}
              <span aria-hidden="true" className="font-mono text-[0.7rem] opacity-75">↵</span>
            </button>
          </div>
        </section>
      )}
      </div>

      {/* The hints are the same key caps the settings screen uses, so a
          binding looks the same wherever it is shown. */}
      <footer className="flex items-center justify-between gap-4 border-t border-border bg-background px-4 py-2.5 text-[0.7rem] text-[var(--text-muted)]">
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <KeyCap>↑↓</KeyCap> move
          </span>
          <span className="flex items-center gap-1.5">
            <KeyCap>Ctrl</KeyCap>
            <KeyCap>1-9</KeyCap> paste
          </span>
          <span className="flex items-center gap-1.5">
            <KeyCap>F8</KeyCap> transform
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {directPasteSupported === null ? (
            "Checking paste support…"
          ) : (
            <>
              <KeyCap>↵</KeyCap>
              {directPasteSupported
                ? `paste${activeKind ? ` (${activeKind.label})` : ""}`
                : "copies, then paste manually"}
            </>
          )}
        </span>
      </footer>
    </main>
  );
}
