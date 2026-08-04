import { useEffect, useRef, useState } from "react";
import { commands } from "../../api/commands";
import type { LibraryItem, SearchQuery } from "../../api/types";
import { buildSearchQuery, getSearchHelpText } from "../../lib/searchParser";
import ItemThumbnail from "../../components/ItemThumbnail";
import { Button } from "@/components/ui/button";

type SearchState = {
  status: "loading" | "ready" | "error";
  items: LibraryItem[];
  total: number;
  offset: number;
};

const baseQuery: SearchQuery = {
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
  limit: 20,
  offset: 0,
};

export default function SearchResultsPage({ query }: { query: string }) {
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<SearchState>({ status: "loading", items: [], total: 0, offset: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const activeQuery = useRef(query);

  useEffect(() => {
    let active = true;
    const queryChanged = activeQuery.current !== query;
    const requestOffset = queryChanged ? 0 : offset;
    activeQuery.current = query;
    if (queryChanged && offset !== 0) setOffset(0);
    setResult((current) => ({ ...current, status: "loading" }));
    
    // Parse search operators from query
    const searchQuery = buildSearchQuery(query, {
      ...baseQuery,
      offset: requestOffset,
    });
    
    commands.searchItems(searchQuery).then(
      (page) => { if (active) setResult({ ...page, status: "ready" }); },
      () => { if (active) setResult({ status: "error", items: [], total: 0, offset: requestOffset }); },
    );
    return () => { active = false; };
  }, [offset, query]);
  const [message, setMessage] = useState("");

  async function copy(item: LibraryItem) {
    await commands.copyItem(item.id, "raw");
    setMessage("Copied to clipboard.");
  }

  async function flag(item: LibraryItem, key: "pinned" | "favorite") {
    await commands.setItemFlags(item.id, { pinned: key === "pinned" ? !item.pinned : null, favorite: key === "favorite" ? !item.favorite : null, archived: null });
    setResult((current) => ({
      ...current,
      items: current.items.map((entry) => entry.id === item.id
        ? { ...entry, [key]: !entry[key] }
        : entry),
    }));
  }

  return (
    <main className="min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4 max-[31rem]:flex-col max-[31rem]:items-start">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Across SnipDock</p>
          <h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Search results</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            type="button"
            onClick={() => setShowHelp(!showHelp)}
          >
            {showHelp ? "Hide help" : "Search help"}
          </Button>
          <span className="text-xs text-muted-foreground">{result.total} results</span>
        </div>
      </header>
      
      {showHelp && (
        <div className="mb-4 rounded-md border border-border bg-muted p-3">
          <h4 className="mb-2 text-xs font-semibold">Search Operators</h4>
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{getSearchHelpText()}</pre>
        </div>
      )}
      
      <div className="sr-only" aria-live="polite">{message}</div>
      {result.status === "loading" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status" aria-busy="true"><span className="size-6 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" /><p>Searching…</p></div>}
      {result.status === "error" && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="alert"><div><h3 className="m-0 text-base font-semibold text-foreground">Search unavailable</h3><p className="mt-2 text-sm">Try again.</p></div></div>}
      {result.status === "ready" && result.items.length === 0 && <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground" role="status"><div><h3 className="m-0 text-base font-semibold text-foreground">No matches</h3><p className="mt-2 text-sm">Try fewer or different words.</p></div></div>}
      {result.items.length > 0 && <div className="grid gap-3">{result.items.map((item) => <article className="rounded-md border border-border bg-card p-4" key={item.id}>
        <div><span className="inline-flex whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-primary">{item.kind}</span>{item.private && <span className="ml-2 inline-flex whitespace-nowrap font-mono text-[0.64rem] font-bold uppercase tracking-[0.02em] text-[var(--color-warning)]">⌾ Private</span>}</div>
        <h3 className="my-2 text-sm font-semibold">{item.title?.trim() || item.kind}</h3>{item.content_type === "image"
          ? <ItemThumbnail item={item} className="mt-0 max-h-24" />
          : <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{item.private ? "Private content" : item.content}</pre>}
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" size="sm" type="button" onClick={() => void copy(item)}>Copy</Button><Button variant="secondary" size="sm" type="button" onClick={() => void flag(item, "pinned")}>{item.pinned ? "Unpin" : "Pin"}</Button><Button variant="secondary" size="sm" type="button" onClick={() => void flag(item, "favorite")}>{item.favorite ? "Unfavorite" : "Favorite"}</Button><Button variant="secondary" size="sm" asChild><a href="#clipboard">Open source</a></Button></div>
      </article>)}</div>}
      <div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="secondary" size="sm" type="button" disabled={result.offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</Button><Button variant="secondary" size="sm" type="button" disabled={result.offset + 20 >= result.total} onClick={() => setOffset(offset + 20)}>Next</Button></div>
    </main>
  );
}
