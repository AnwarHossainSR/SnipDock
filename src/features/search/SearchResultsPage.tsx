import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CommandError, commands } from "../../api/commands";
import type { LibraryItem } from "../../api/types";
import { clipboardQuery } from "../../lib/searchQuery";
import { buildSearchQuery, getSearchHelpText } from "../../lib/searchParser";
import Highlight, { highlightTerms } from "../../components/Highlight";
import ItemThumbnail from "../../components/ItemThumbnail";
import {
  contentTypeChipStyle,
  contentTypeSpineStyle,
  isCodeShaped,
  itemTypeLabel,
} from "../../lib/contentTypeColors";
import { useImageMeta } from "../../lib/imageMeta";
import { describeItem } from "../../lib/itemMetadata";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/relativeTime";
import { useClipboardStore } from "../../stores/clipboardStore";
import { matchExcerpt } from "../clipboard/normalizePreview";
import SearchModeToggle from "../clipboard/SearchModeToggle";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type SearchState = {
  status: "loading" | "ready" | "error";
  items: LibraryItem[];
  total: number;
  offset: number;
};

const baseQuery = clipboardQuery({ limit: PAGE_SIZE });

const iconClass = "size-3.5 shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]";

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
      {/* The history row's pin, so the two pages show one symbol for it. */}
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" />
      <path d="M12 14v6" />
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

// The history row's caption register, so a result reads as the same row seen
// from another page rather than as a different kind of thing.
const metaClass = "font-mono text-[0.68rem] tracking-[0.02em] text-[var(--text-muted)]";

const actionClass =
  "inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary";

/**
 * One result, laid out like a history row: the capture leads, the type,
 * size, source, and age caption it, and the typed terms are marked.
 *
 * This was a card per result that led with the item's kind twice - an
 * eyebrow reading "CLIPBOARD" over a heading reading "clipboard", since
 * captures have no title - and printed the whole capture beneath, so three
 * results filled the page and none said why it matched. The heading is now
 * the title where there is one and the capture's own text where there is
 * not, and the text shown is the part that matched (see `matchExcerpt`).
 */
function SearchResult({
  item,
  terms,
  onCopy,
  onFlag,
}: {
  item: LibraryItem;
  terms: string[];
  onCopy: () => void;
  onFlag: (key: "pinned" | "favorite") => void;
}) {
  const imageMeta = useImageMeta(item);
  const description = describeItem(item, imageMeta);
  const title = item.title?.trim();
  const image = item.content_type === "image";
  const excerpt = image || item.private ? "" : matchExcerpt(item.content, item.content_type, terms);
  const excerptClass = cn(
    "m-0 line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere]",
    isCodeShaped(item.content_type)
      ? "font-mono text-[0.8rem] leading-[1.5]"
      : "font-sans text-[0.87rem] leading-[1.5]",
  );

  return (
    <article
      style={contentTypeSpineStyle(item.content_type)}
      className={
        "relative flex min-w-0 items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 " +
        "transition-colors duration-150 ease-out motion-reduce:transition-none " +
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--spine)] " +
        "hover:bg-[color-mix(in_srgb,var(--spine)_5%,var(--surface-2))]"
      }
    >
      {image && (
        <span className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-border bg-muted/60 p-1">
          <ItemThumbnail item={item} className="mt-0 h-12 w-20 rounded-sm border-0 object-cover" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <time
          className={`float-right ml-3 ${metaClass} whitespace-nowrap tabular-nums`}
          dateTime={item.created_at}
          title={formatAbsoluteTime(item.created_at)}
        >
          {formatRelativeTime(item.created_at)}
        </time>
        {/* The base styles give headings the display face; a result's
            heading is a capture, so it is set like one. */}
        <h3 className="m-0 font-sans text-[0.87rem] font-normal leading-[1.5] text-foreground [word-spacing:normal]">
          {title ? (
            <span className="line-clamp-1 font-medium">
              <Highlight text={title} terms={terms} />
            </span>
          ) : image ? (
            "Image"
          ) : item.private ? (
            <span className="italic text-muted-foreground">Private content</span>
          ) : (
            <span className={excerptClass}>
              <Highlight text={excerpt} terms={terms} />
            </span>
          )}
        </h3>
        {title && excerpt && (
          <p className={cn(excerptClass, "mt-0.5 text-muted-foreground")}>
            <Highlight text={excerpt} terms={terms} />
          </p>
        )}
        {title && item.private && (
          <p className="m-0 mt-0.5 text-[0.8rem] italic text-muted-foreground">Private content</p>
        )}

        <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${metaClass}`}>
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
            style={contentTypeChipStyle(item.content_type)}
          >
            {itemTypeLabel(item)}
          </span>
          {description && (
            <>
              <span aria-hidden="true" className="text-[var(--text-muted)]/50">·</span>
              <span>{description}</span>
            </>
          )}
          {item.source_app && (
            <>
              <span aria-hidden="true" className="text-[var(--text-muted)]/50">·</span>
              <span className="max-w-[10rem] truncate" title={item.source_app}>{item.source_app}</span>
            </>
          )}
          {item.private && (
            <>
              <span aria-hidden="true" className="text-[var(--text-muted)]/50">·</span>
              <span className="text-[var(--warning)]">Private</span>
            </>
          )}
        </div>
      </div>
      <div className="-my-0.5 flex shrink-0 items-center gap-0.5">
        <Tooltip label="Copy to clipboard">
          <button type="button" onClick={onCopy} className={actionClass} aria-label="Copy to clipboard">
            <CopyIcon />
          </button>
        </Tooltip>
        <Tooltip label={item.pinned ? "Unpin item" : "Pin item"}>
          <button
            type="button"
            onClick={() => onFlag("pinned")}
            className={cn(actionClass, item.pinned && "text-primary")}
            aria-label={item.pinned ? "Unpin item" : "Pin item"}
          >
            <PinIcon />
          </button>
        </Tooltip>
        <Tooltip label={item.favorite ? "Remove from favorites" : "Add to favorites"}>
          <button
            type="button"
            onClick={() => onFlag("favorite")}
            className={cn(actionClass, item.favorite && "text-[var(--warning)]")}
            aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <HeartIcon filled={item.favorite} />
          </button>
        </Tooltip>
        {/* This was an anchor to #clipboard, which did nothing at all: the
            results stayed mounted over the destination it pointed at. The
            store already has the mechanism for revealing one row, and App
            already clears the query when a focus request is raised. */}
        <Tooltip label="Show in history">
          <button
            type="button"
            onClick={() => useClipboardStore.getState().requestFocusItem(item.id)}
            className={actionClass}
            aria-label="Show in history"
          >
            <ExternalLinkIcon />
          </button>
        </Tooltip>
      </div>
    </article>
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
  // From the debounced query this page is handed, so the marks move when the
  // rows do rather than with every keystroke.
  const terms = highlightTerms(query, searchMode);

  useEffect(() => {
    let active = true;
    const queryChanged = activeQuery.current !== query;
    const requestOffset = queryChanged ? 0 : offset;
    activeQuery.current = query;
    if (queryChanged && offset !== 0) setOffset(0);
    setResult((current) => ({ ...current, status: "loading" }));

    // This page is on screen from the first keystroke, but the query it is
    // handed is debounced, so for that first 300ms it is still empty. An empty
    // query is not a search - run as one it matched everything, and the whole
    // history flashed up under "Search results" before the real answer
    // replaced it. Stay in "Searching…" until there is something to look for.
    if (!query.trim()) return () => { active = false; };

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
      const updated = await commands.setItemFlags(item.id, { pinned: key === "pinned" ? !item.pinned : null, favorite: key === "favorite" ? !item.favorite : null, archived: null });
      setResult((current) => ({
        ...current,
        items: current.items.map((entry) => entry.id === updated.id ? updated : entry),
      }));
      // These results are the history seen from another page, so a flag set
      // here has to reach the store too - otherwise clearing the search shows
      // the row with the state it had before the click.
      useClipboardStore.getState().replaceItem(updated);
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
      {toastMessage && <Toast>{toastMessage}</Toast>}
      {/* Only when there is nothing to keep. A refetch holds the previous
          rows, and rendering this beside them put a spinner and a full list
          on screen at once, each contradicting the other. */}
      {result.status === "loading" && result.items.length === 0 && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status" aria-busy="true"><span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" /><p>Searching…</p></div>}
      {result.status === "error" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="alert"><div><h3 className="m-0 text-base font-semibold text-foreground">Search unavailable</h3><p className="mt-2 text-sm">Try again.</p></div></div>}
      {result.status === "ready" && result.items.length === 0 && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status"><div><h3 className="m-0 text-base font-semibold text-foreground">No matches</h3><p className="mt-2 text-sm">Try fewer or different words.</p></div></div>}
      {result.items.length > 0 && (
        <div
          className={
            "overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-panel)] transition-opacity" +
            (result.status === "loading" ? " opacity-50" : "")
          }
          aria-busy={result.status === "loading"}
        >
          {result.items.map((item) => (
            <SearchResult
              key={item.id}
              item={item}
              terms={terms}
              onCopy={() => void copy(item)}
              onFlag={(key) => void flag(item, key)}
            />
          ))}
        </div>
      )}
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
