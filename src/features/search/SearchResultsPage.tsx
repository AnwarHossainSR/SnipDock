import { useState } from "react";
import { commands } from "../../api/commands";
import type { LibraryItem } from "../../api/types";
import { useLibraryQuery } from "../library/useLibraryQuery";

const kinds = ["clipboard", "snippet", "command", "template", "note"] as const;

export default function SearchResultsPage({ query }: { query: string }) {
  const result = useLibraryQuery({ controlledText: query, initialKinds: [...kinds] });
  const [message, setMessage] = useState("");

  async function copy(item: LibraryItem) {
    await commands.copyItem(item.id, "raw");
    setMessage("Copied to clipboard.");
  }

  async function flag(item: LibraryItem, key: "pinned" | "favorite") {
    await commands.setItemFlags(item.id, { pinned: key === "pinned" ? !item.pinned : null, favorite: key === "favorite" ? !item.favorite : null, archived: null });
    result.refresh();
  }

  return (
    <main className="workspace-content search-results">
      <header className="content-heading"><div><p>Across SnipDock</p><h2 id="workspace-title" tabIndex={-1}>Search results</h2></div><span className="item-count">{result.total} results</span></header>
      <div className="sr-only" aria-live="polite">{message}</div>
      {result.status === "loading" && <div className="content-state" role="status" aria-busy="true"><span className="loading-ring" aria-hidden="true" /><p>Searching…</p></div>}
      {result.status === "error" && <div className="content-state" role="alert"><div><h3>Search unavailable</h3><p>Try again.</p></div></div>}
      {result.status === "ready" && result.items.length === 0 && <div className="content-state" role="status"><div><h3>No matches</h3><p>Try fewer or different words.</p></div></div>}
      {result.items.length > 0 && <div className="search-result-list">{result.items.map((item) => <article className="search-result-card" key={item.id}>
        <div><span className="type-badge">{item.kind}</span>{item.private && <span className="private-badge">⌾ Private</span>}</div>
        <h3>{item.title?.trim() || item.kind}</h3><pre>{item.private ? "Private content" : item.content}</pre>
        <div className="search-result-actions"><button type="button" onClick={() => void copy(item)}>Copy</button><button type="button" onClick={() => void flag(item, "pinned")}>{item.pinned ? "Unpin" : "Pin"}</button><button type="button" onClick={() => void flag(item, "favorite")}>{item.favorite ? "Unfavorite" : "Favorite"}</button><a href={item.kind === "clipboard" ? "#clipboard" : "#library"}>Open source</a></div>
      </article>)}</div>}
      <div className="pager"><button type="button" disabled={result.offset === 0} onClick={result.previousPage}>Previous</button><button type="button" disabled={result.offset + 20 >= result.total} onClick={result.nextPage}>Next</button></div>
    </main>
  );
}
