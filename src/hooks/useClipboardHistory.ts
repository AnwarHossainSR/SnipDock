import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "../api/commands";
import type { ContentType, LibraryItem, SearchQuery } from "../api/types";

export type ClipboardFilter = "all" | "code" | "pinned" | "favorite";

const PAGE_SIZE = 30;
const codeTypes: ContentType[] = [
  "code", "json", "sql", "html", "css", "xml", "shell", "markdown", "config",
];

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
  limit: PAGE_SIZE,
  offset: 0,
};

function queryFor(filter: ClipboardFilter): SearchQuery {
  return {
    ...baseQuery,
    content_types: filter === "code" ? codeTypes : [],
    pinned: filter === "pinned" ? true : null,
    favorite: filter === "favorite" ? true : null,
  };
}

export type HistoryState =
  | { status: "loading"; items: LibraryItem[]; total: number }
  | { status: "ready"; items: LibraryItem[]; total: number }
  | { status: "error"; items: LibraryItem[]; total: number };

export function useClipboardHistory(filter: ClipboardFilter) {
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    items: [],
    total: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  const loadHistory = useCallback(async () => {
    const id = ++requestId.current;
    const result = await commands.searchItems(queryFor(filter));
    if (id !== requestId.current) return;
    setHistory({ status: "ready", items: result.items, total: result.total });
  }, [filter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || history.status !== "ready") return;
    if (history.items.length >= history.total) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const result = await commands.searchItems({
        ...queryFor(filter),
        offset: history.items.length,
      });
      if (id !== requestId.current) return;
      setHistory((current) =>
        current.status === "ready"
          ? {
              ...current,
              total: result.total,
              items: [
                ...current.items,
                ...result.items.filter(
                  (next) => !current.items.some((item) => item.id === next.id),
                ),
              ],
            }
          : current,
      );
    } finally {
      setLoadingMore(false);
    }
  }, [filter, history.status, history.items, history.total, loadingMore]);

  useEffect(() => {
    let active = true;
    setHistory((current) => ({ ...current, status: "loading" }));
    loadHistory().then(
      () => {},
      () => {
        if (active) setHistory({ status: "error", items: [], total: 0 });
      },
    );
    return () => {
      active = false;
    };
  }, [loadHistory]);

  const replaceItem = useCallback((updated: LibraryItem) => {
    setHistory((current) =>
      current.status === "ready"
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          }
        : current,
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setHistory((current) =>
      current.status === "ready"
        ? {
            ...current,
            items: current.items.filter((entry) => entry.id !== id),
            total: Math.max(0, current.total - 1),
          }
        : current,
    );
  }, []);

  const removeItems = useCallback((ids: Set<string>) => {
    setHistory((current) =>
      current.status === "ready"
        ? {
            ...current,
            items: current.items.filter((item) => !ids.has(item.id)),
            total: Math.max(0, current.total - ids.size),
          }
        : current,
    );
  }, []);

  return {
    history,
    loadingMore,
    loadMore,
    reload: loadHistory,
    replaceItem,
    removeItem,
    removeItems,
  };
}
