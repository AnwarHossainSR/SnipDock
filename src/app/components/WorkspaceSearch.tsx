import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import { isMac } from "../../lib/shortcuts";

/**
 * Operators the search understands, offered in the field while it is empty.
 * Each is real syntax (see lib/searchParser), so choosing one teaches it.
 * There is no "today": the backend compares dates as UTC text, so a local day
 * would be cut at the wrong hour anywhere far from UTC.
 */
const SUGGESTIONS = ["type:code", "type:json", "type:image", "pinned:true"];

/** Where the caret was, and whether the field had focus, the last time the
 *  user touched it. */
export interface SearchFocusState {
  focused: boolean;
  start: number;
  end: number;
}

interface WorkspaceSearchProps {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Carries focus and caret across the field's one remount - see below. */
  focusState: RefObject<SearchFocusState>;
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
  /** Opens the command palette, which the Ctrl/Cmd+K caps in the field stand for. */
  onOpenPalette?: () => void;
}

/**
 * The history search field. It sits in the content column, directly under the
 * page heading, rather than in the window chrome: it belongs to the list it
 * filters, and up in the top bar it read as one more piece of chrome around
 * the captures instead of the way into them.
 *
 * Because it lives inside the page, it is remounted once - when the first
 * character swaps the history for the results, and again when the last one is
 * deleted. Focus and caret are recorded on every interaction and restored on
 * mount, so that swap is invisible to someone typing.
 */
export default function WorkspaceSearch({
  inputRef,
  focusState,
  query,
  onQueryChange,
  onClear,
  onOpenPalette,
}: WorkspaceSearchProps) {
  const paletteKeys = [isMac() ? "⌘" : "Ctrl", "K"];

  // Starts a search with an operator. The field is about to be swapped for
  // the results page's, so focus is recorded as the remount will restore it.
  function suggest(token: string) {
    const next = `${token} `;
    focusState.current = { focused: true, start: next.length, end: next.length };
    onQueryChange(next);
    inputRef.current?.focus();
  }

  function remember(element: HTMLInputElement) {
    focusState.current = {
      focused: true,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
    };
  }

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element || !focusState.current.focused) return;
    element.focus();
    // A search input supports the selection API, but a browser that refuses
    // is no reason to lose the focus that matters more.
    try {
      element.setSelectionRange(focusState.current.start, focusState.current.end);
    } catch {
      // Caret position is a nicety; focus is the point.
    }
    // Mount only: this is the remount the page swap causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="search"
      className="@container mb-4 flex h-[54px] w-full items-center gap-3.5 rounded-[14px] border border-[var(--border-strong)] bg-card pl-[18px] pr-2.5 shadow-[var(--shadow-panel)] transition-[border-color,box-shadow] duration-100 hover:border-[color-mix(in_srgb,var(--text-muted)_45%,var(--border))] focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent),var(--shadow-panel)] max-[31rem]:h-12 max-[31rem]:pl-3.5"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[1.15rem] shrink-0 fill-none stroke-current text-[var(--text-muted)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </svg>
      <label className="sr-only" htmlFor="workspace-search">Search clipboard</label>
      <input
        ref={inputRef}
        id="workspace-search"
        type="search"
        placeholder="Find anything you copied…"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          remember(event.currentTarget);
          onQueryChange(event.target.value);
        }}
        onFocus={(event) => remember(event.currentTarget)}
        onBlur={() => {
          focusState.current = { ...focusState.current, focused: false };
        }}
        onSelect={(event) => remember(event.currentTarget)}
        onKeyUp={(event) => remember(event.currentTarget)}
        onKeyDown={(event) => { if (event.key === "Escape") onClear(); }}
        // `type="search"` brings the engine's own clear button with it -
        // Chromium's, so WebView2's too. This field draws its own, so the
        // native one is suppressed; without that, two sat side by side.
        className="min-w-0 flex-1 border-0 bg-transparent font-display text-[1.1rem] text-foreground outline-none placeholder:text-[var(--text-muted)] [&::-webkit-search-cancel-button]:appearance-none"
      />
      {!query && (
        <span className="hidden shrink-0 items-center gap-1.5 @[50rem]:flex" role="group" aria-label="Search suggestions">
          {SUGGESTIONS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => suggest(token)}
              className="h-7 min-h-0 rounded-full border border-border bg-[var(--surface-2)] px-2.5 font-mono text-[0.7rem] text-muted-foreground transition-colors hover:border-[var(--border-strong)] hover:text-foreground"
            >
              {token}
            </button>
          ))}
        </span>
      )}
      {query && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="grid size-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
      {onOpenPalette && (
        // The palette's shortcut, drawn as the keys and clickable: the
        // shortcut is otherwise undiscoverable from this screen.
        <button
          type="button"
          onClick={onOpenPalette}
          // The caps are the visible label, so the name carries them too.
          aria-label={`Open command palette (${paletteKeys.join(" ")})`}
          title="Command palette"
          className="hidden shrink-0 items-center gap-1 rounded-[7px] px-1.5 py-[5px] hover:bg-muted min-[31rem]:flex"
        >
          {paletteKeys.map((key) => (
            <kbd
              key={key}
              aria-hidden="true"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-b-2 border-border bg-background px-1.5 font-mono text-[0.62rem] font-medium text-muted-foreground"
            >
              {key}
            </kbd>
          ))}
        </button>
      )}
    </div>
  );
}
