import { useEffect, useRef, useState } from "react";
import { commands } from "../../lib/commands";
import type {
  ContentType,
  Id,
  ItemKind,
  LibraryItem,
  SearchQuery,
  SortOrder,
} from "../../lib/types";

export interface LibraryFilters {
  kinds: ItemKind[];
  contentTypes: ContentType[];
  languages: string[];
  projectIds: Id[];
  categoryIds: Id[];
  tagIds: Id[];
  pinned: boolean | null;
  favorite: boolean | null;
  createdFrom: string | null;
  createdTo: string | null;
}

export const emptyFilters: LibraryFilters = {
  kinds: [],
  contentTypes: [],
  languages: [],
  projectIds: [],
  categoryIds: [],
  tagIds: [],
  pinned: null,
  favorite: null,
  createdFrom: null,
  createdTo: null,
};

export const PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 100;

type QueryState =
  | { status: "loading"; items: LibraryItem[]; total: number }
  | { status: "ready"; items: LibraryItem[]; total: number }
  | { status: "error"; items: LibraryItem[]; total: number };

function buildQuery(
  text: string,
  filters: LibraryFilters,
  sort: SortOrder,
  offset: number,
): SearchQuery {
  return {
    text: text.trim() ? text.trim() : null,
    kinds: filters.kinds,
    content_types: filters.contentTypes,
    languages: filters.languages,
    project_ids: filters.projectIds,
    category_ids: filters.categoryIds,
    tag_ids: filters.tagIds,
    pinned: filters.pinned,
    favorite: filters.favorite,
    created_from: filters.createdFrom,
    created_to: filters.createdTo,
    sort,
    limit: PAGE_SIZE,
    offset,
  };
}

export function useLibraryQuery() {
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [filters, setFiltersState] = useState<LibraryFilters>(emptyFilters);
  const [sort, setSortState] = useState<SortOrder>("newest");
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<QueryState>({
    status: "loading",
    items: [],
    total: 0,
  });
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const id = ++requestId.current;
    setState((current) => ({ ...current, status: "loading" }));
    commands.searchItems(buildQuery(debouncedText, filters, sort, offset)).then(
      (page) => {
        if (id !== requestId.current) return;
        setState({ status: "ready", items: page.items, total: page.total });
      },
      () => {
        if (id !== requestId.current) return;
        setState({ status: "error", items: [], total: 0 });
      },
    );
  }, [debouncedText, filters, sort, offset]);

  function setFilters(update: Partial<LibraryFilters>) {
    setFiltersState((current) => ({ ...current, ...update }));
    setOffset(0);
  }

  function clearFilters() {
    setFiltersState(emptyFilters);
    setOffset(0);
  }

  function setSort(order: SortOrder) {
    setSortState(order);
    setOffset(0);
  }

  function nextPage() {
    setOffset((current) => (current + PAGE_SIZE < state.total ? current + PAGE_SIZE : current));
  }

  function previousPage() {
    setOffset((current) => Math.max(0, current - PAGE_SIZE));
  }

  return {
    text,
    setText,
    filters,
    setFilters,
    clearFilters,
    sort,
    setSort,
    offset,
    pageSize: PAGE_SIZE,
    nextPage,
    previousPage,
    status: state.status,
    items: state.items,
    total: state.total,
  };
}
