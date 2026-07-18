import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import type { Category, LibraryItem, Project, Tag } from "../../api/types";
import FilterPanel from "./FilterPanel";
import SearchBar from "./SearchBar";
import { useLibraryQuery } from "./useLibraryQuery";

type TaxonomyState =
  | { status: "loading"; projects: Project[]; categories: Category[]; tags: Tag[] }
  | { status: "ready"; projects: Project[]; categories: Category[]; tags: Tag[] }
  | { status: "error"; projects: Project[]; categories: Category[]; tags: Tag[] };

function itemTitle(item: LibraryItem) {
  return item.title?.trim() || item.kind[0].toUpperCase() + item.kind.slice(1);
}

function itemPreview(item: LibraryItem) {
  const text = item.description?.trim() || item.content.trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export default function LibraryList() {
  const query = useLibraryQuery();
  const [taxonomy, setTaxonomy] = useState<TaxonomyState>({
    status: "loading",
    projects: [],
    categories: [],
    tags: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      commands.listProjects(false),
      commands.listCategories(),
      commands.listTags(),
    ]).then(
      ([projects, categories, tags]) => {
        if (!active) return;
        setTaxonomy({ status: "ready", projects, categories, tags });
      },
      () => {
        if (active) setTaxonomy({ status: "error", projects: [], categories: [], tags: [] });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (query.items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!query.items.some((item) => item.id === selectedId)) {
      setSelectedId(query.items[0].id);
    }
  }, [query.items, selectedId]);

  function selectByKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(index + 1, query.items.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = query.items.length - 1;
    else return;

    event.preventDefault();
    const item = query.items[next];
    if (!item) return;
    setSelectedId(item.id);
    document.getElementById(`library-item-${item.id}`)?.focus();
  }

  const rangeStart = query.total === 0 ? 0 : query.offset + 1;
  const rangeEnd = Math.min(query.offset + query.pageSize, query.total);

  return (
    <main className="workspace-content">
      <header className="content-heading snippet-heading">
        <div>
          <p>Library</p>
          <h2 id="workspace-title" tabIndex={-1}>Search everything</h2>
        </div>
        <div className="snippet-heading__actions">
          <SearchBar value={query.text} onChange={query.setText} />
        </div>
      </header>

      <FilterPanel
        filters={query.filters}
        sort={query.sort}
        projects={taxonomy.projects}
        categories={taxonomy.categories}
        tags={taxonomy.tags}
        onFiltersChange={query.setFilters}
        onSortChange={query.setSort}
        onClear={query.clearFilters}
      />

      <section
        className={query.status === "ready" && query.items.length > 0
          ? "content-panel snippet-panel has-items"
          : "content-panel snippet-panel"}
        aria-label="Search results"
      >
        {query.status === "loading" && (
          <div className="content-state" role="status" aria-busy="true">
            <span className="loading-ring" aria-hidden="true" />
            <p>Searching...</p>
          </div>
        )}
        {query.status === "error" && (
          <div className="content-state" role="alert">
            <span className="state-mark" aria-hidden="true">!</span>
            <div>
              <h3>Search unavailable</h3>
              <p>Close and reopen SnipDock to try again.</p>
            </div>
          </div>
        )}
        {query.status === "ready" && query.items.length === 0 && (
          <div className="content-state" role="status">
            <div>
              <h3>No results</h3>
              <p>Try a different search term or clear your filters.</p>
            </div>
          </div>
        )}
        {query.status === "ready" && query.items.length > 0 && (
          <>
            <div className="snippet-list__items" role="listbox" aria-label="Search results">
              {query.items.map((item, index) => (
                <button
                  id={`library-item-${item.id}`}
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
                  <span className="snippet-list__meta">{item.kind} · {itemPreview(item)}</span>
                </button>
              ))}
            </div>
            <div className="snippet-heading__actions" aria-label="Paging">
              <span className="item-count">
                {`${rangeStart}-${rangeEnd} of ${query.total}`}
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={query.offset === 0}
                onClick={query.previousPage}
              >
                Previous
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={rangeEnd >= query.total}
                onClick={query.nextPage}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
