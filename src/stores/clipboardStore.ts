import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
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

export type HistoryStatus = "loading" | "ready" | "error";

export interface ClipboardState {
  // History
  items: LibraryItem[];
  total: number;
  status: HistoryStatus;
  loadingMore: boolean;
  filter: ClipboardFilter;

  // Selection
  selectedIds: Set<string>;
  multiSelectMode: boolean;

  // Actions
  loadHistory: () => Promise<void>;
  loadMore: () => Promise<void>;
  setFilter: (filter: ClipboardFilter) => void;
  replaceItem: (updated: LibraryItem) => void;
  removeItem: (id: string) => void;
  removeItems: (ids: Set<string>) => void;

  // Selection actions
  toggleItemSelect: (id: string) => void;
  selectSingle: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setMultiSelectMode: (mode: boolean) => void;
}

let historyRequestId = 0;

export const useClipboardStore = create<ClipboardState>()(
  subscribeWithSelector((set, get) => ({
    // History state
    items: [],
    total: 0,
    status: "loading",
    loadingMore: false,
    filter: "all",

    // Selection state
    selectedIds: new Set(),
    multiSelectMode: false,

    // History actions
    loadHistory: async () => {
      const requestId = ++historyRequestId;
      const { filter } = get();
      set({ status: "loading" });
      try {
        const result = await commands.searchItems(queryFor(filter));
        if (requestId !== historyRequestId) return;
        set({ items: result.items, total: result.total, status: "ready" });
      } catch {
        if (requestId !== historyRequestId) return;
        set({ status: "error" });
      }
    },

    loadMore: async () => {
      const { items, total, loadingMore, filter } = get();
      if (loadingMore || items.length >= total) return;
      const requestId = historyRequestId;

      set({ loadingMore: true });
      try {
        const result = await commands.searchItems({
          ...queryFor(filter),
          offset: items.length,
        });
        if (requestId !== historyRequestId) return;
        set((state) => ({
          items: [
            ...state.items,
            ...result.items.filter(
              (next) => !state.items.some((item) => item.id === next.id),
            ),
          ],
          total: result.total,
        }));
      } catch {
        // Pagination failure: keep existing items, allow retry via scroll.
      } finally {
        set({ loadingMore: false });
      }
    },

    setFilter: (filter) => {
      set({ filter, items: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    replaceItem: (updated) => {
      set((state) => ({
        items: state.items.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      }));
    },

    removeItem: (id) => {
      set((state) => {
        const selectedIds = new Set(state.selectedIds);
        selectedIds.delete(id);
        return {
          items: state.items.filter((item) => item.id !== id),
          total: Math.max(0, state.total - 1),
          selectedIds,
          multiSelectMode: selectedIds.size > 0 && state.multiSelectMode,
        };
      });
    },

    removeItems: (ids) => {
      set((state) => {
        const selectedIds = new Set(state.selectedIds);
        for (const id of ids) selectedIds.delete(id);
        return {
          items: state.items.filter((item) => !ids.has(item.id)),
          total: Math.max(0, state.total - ids.size),
          selectedIds,
          multiSelectMode: selectedIds.size > 0 && state.multiSelectMode,
        };
      });
    },

    // Selection actions
    toggleItemSelect: (id) => {
      set((state) => {
        const newSet = new Set(state.selectedIds);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return { selectedIds: newSet, multiSelectMode: newSet.size > 0 };
      });
    },

    selectSingle: (id) => {
      set({ selectedIds: new Set([id]) });
    },

    selectAll: () => {
      const { items } = get();
      set({
        selectedIds: new Set(items.map((item) => item.id)),
        multiSelectMode: true,
      });
    },

    clearSelection: () => {
      set({ selectedIds: new Set(), multiSelectMode: false });
    },

    setMultiSelectMode: (mode) => {
      set({ multiSelectMode: mode });
    },
  })),
);

export function resetClipboardStore() {
  historyRequestId++;
  useClipboardStore.setState({
    items: [],
    total: 0,
    status: "loading",
    loadingMore: false,
    filter: "all",
    selectedIds: new Set(),
    multiSelectMode: false,
  });
}
