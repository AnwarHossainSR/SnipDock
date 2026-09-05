import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CommandError, commands } from "../../api/commands";
import type { LibraryItem } from "../../api/types";
import { clipboardQuery } from "../../lib/searchQuery";
import { buildSearchQuery, getSearchHelpText } from "../../lib/searchParser";
import ItemThumbnail from "../../components/ItemThumbnail";
import { useClipboardStore } from "../../stores/clipboardStore";
import SearchModeToggle from "../clipboard/SearchModeToggle";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 20;

type SearchState = {
  status: "loading" | "ready" | "error";
  items: LibraryItem[];
  total: number;
  offset: number;
};

const baseQuery = clipboardQuery({ limit: PAGE_SIZE });

const iconClass = "size-4 shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]";

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass}>
      <path d="M12 17v5M9 2l6 0 0 5.5c0 1.5-1 2.5-2 3-1-.5-2-1.5-2-3z" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${iconClass} fill-current`}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.68rem] font-medium text-foreground shadow-[var(--shadow-panel)]" role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}

export default function SearchResultsPage({
  query,
  searchSlot,
}: {
  query: string;
  /** The workspace search field, so searching never takes the box away with
   *  the page it replaced. */
  searchSlot?: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<SearchState>({ status: "loading", items: [], total: 0, offset: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const activeQuery = useRef(query);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Surfaced inline above the result list. The spec says Dismiss restores
  // the previous query and clears the error; switching back to Literal
  // also gets the user moving again without retyping.
  const [regexError, setRegexError] = useState("");
  const searchMode = useClipboardStore((state) => state.searchMode);
  const setSearchMode = useClipboardStore((state) => state.setSearchMode);

  useEffect(() => {
    let active = true;
    const queryChanged = activeQuery.current !== query;
    const requestOffset = queryChanged ? 0 : offset;
    activeQuery.current = query;
    if (queryChanged && offset !== 0) setOffset(0);
    setResult((current) => ({ ...current, status: "loading" }));

    // In Regex mode the parser's free-text operators are skipped: the
    // whole query is treated as a raw pattern. `buildSearchQuery` still
    // owns operator extraction (type:, kind:, etc.) so the two screens
    // share a single parser.
    const searchModeValue = useClipboardStore.getState().searchMode;
    const base = { ...baseQuery, offset: requestOffset };
    const searchQuery = searchModeValue === "regex"
      ? { ...buildSearchQuery("", base), text: null, regex: query.trim() || null, regex_case_insensitive: null }
      : buildSearchQuery(query, base);

    commands.searchItems(searchQuery).then(
      (page) => {
        if (!active) return;
        setResult({ ...page, status: "ready" });
        setRegexError("");
      },
      (cause) => {
        if (!active) return;
        if (cause instanceof CommandError && cause.code === "invalid_regex") {
          setRegexError(cause.message);
          // Keep the previously rendered rows on screen per the spec; only
          // the loading state and the error chip change.
          return;
        }
        setResult({ status: "error", items: [], total: 0, offset: requestOffset });
      },
    );
    return () => { active = false; };
  }, [offset, query, searchMode]);

  function showToast(message: string) {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToastMessage(message);
    toastTimeout.current = setTimeout(() => setToastMessage(""), 2000);
  }

  async function copy(item: LibraryItem) {
    try {
      await commands.copyItem(item.id, "raw");
      showToast("Copied to clipboard");
    } catch {
      showToast("Copy failed");
    }
  }

  async function flag(item: LibraryItem, key: "pinned" | "favorite") {
    try {
      await commands.setItemFlags(item.id, { pinned: key === "pinned" ? !item.pinned : null, favorite: key === "favorite" ? !item.favorite : null, archived: null });
      setResult((current) => ({
        ...current,
        items: current.items.map((entry) => entry.id === item.id
          ? { ...entry, [key]: !entry[key] }
          : entry),
      }));
    } catch {
      showToast("Update failed");
    }
  }

  return (
    <main className="min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4 max-[31rem]:flex-col max-[31rem]:items-start">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Across SnipDock</p>
          <h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Search results</h2>
        </div>
        <div className="flex items-center gap-2">
          <SearchModeToggle value={searchMode} onChange={setSearchMode} size="sm" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            type="button"
            onClick={() => setShowHelp(!showHelp)}
          >
            {showHelp ? "Hide help" : "Search help"}
          </Button>
        </div>
      </header>
      {searchSlot}

      {showHelp && (
        <div className="mb-4 rounded-md border border-border bg-muted p-3">
          <h4 className="mb-2 text-xs font-semibold">Search Operators</h4>
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{getSearchHelpText()}</pre>
        </div>
      )}

      {regexError && (
        <div
          className="mb-4 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
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
              // The query prop is owned by the router, so we cannot edit it
              // here. Clearing the error and falling back to Literal mode
              // is what the spec calls for; the user can adjust the query
              // in the address bar or in the originating input.
              setSearchMode("literal");
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="sr-only" aria-live="polite">{toastMessage}</div>
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-[0.8rem] font-semibold text-foreground shadow-[var(--shadow-panel)]" role="status" aria-live="polite">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-current text-[var(--success)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toastMessage}
        </div>
      )}
      {result.status === "loading" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status" aria-busy="true"><span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" /><p>Searching…</p></div>}
      {result.status === "error" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="alert"><div><h3 className="m-0 text-base font-semibold text-foreground">Search unavailable</h3><p className="mt-2 text-sm">Try again.</p></div></div>}
      {result.status === "ready" && result.items.length === 0 && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status"><div><h3 className="m-0 text-base font-semibold text-foreground">No matches</h3><p className="mt-2 text-sm">Try fewer or different words.</p></div></div>}
      {result.items.length > 0 && <div className="grid gap-3">{result.items.map((item) => <article className="rounded-md border border-border bg-card p-4" key={item.id}>
        <div><span className="inline-flex whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-primary">{item.kind}</span>{item.private && <span className="ml-2 inline-flex whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-[var(--warning)]">⌾ Private</span>}</div>
        <h3 className="my-2 text-sm font-semibold">{item.title?.trim() || item.kind}</h3>{item.content_type === "image"
          ? <ItemThumbnail item={item} className="mt-0 max-h-24" />
          : <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{item.private ? "Private content" : item.content}</pre>}
        <div className="mt-3 flex items-center gap-1">
          <Tooltip label="Copy to clipboard">
            <button
              type="button"
              onClick={() => void copy(item)}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              aria-label="Copy to clipboard"
            >
              <CopyIcon />
            </button>
          </Tooltip>
          <Tooltip label={item.pinned ? "Unpin item" : "Pin item"}>
            <button
              type="button"
              onClick={() => void flag(item, "pinned")}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              aria-label={item.pinned ? "Unpin item" : "Pin item"}
            >
              <PinIcon />
            </button>
          </Tooltip>
          <Tooltip label={item.favorite ? "Remove from favorites" : "Add to favorites"}>
            <button
              type="button"
              onClick={() => void flag(item, "favorite")}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
            >
              <HeartIcon filled={item.favorite} />
            </button>
          </Tooltip>
          <Tooltip label="Open source">
            <a
              href="#clipboard"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              aria-label="Open source"
            >
              <ExternalLinkIcon />
            </a>
          </Tooltip>
        </div>
      </article>)}</div>}
      {result.total > 0 && (
        <Pagination
          className="mt-4 rounded-lg border border-border bg-card shadow-[var(--shadow-panel)]"
          label="Search result pages"
          noun={["result", "results"]}
          page={Math.floor(result.offset / PAGE_SIZE) + 1}
          pageSize={PAGE_SIZE}
          total={result.total}
          count={result.items.length}
          busy={result.status === "loading"}
          onPageChange={(next) => setOffset((next - 1) * PAGE_SIZE)}
        />
      )}
    </main>
  );
}
