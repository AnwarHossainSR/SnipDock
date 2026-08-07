import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { commands } from "../api/commands";
import type { ContentType, GroupBy, LibraryItem, SearchQuery } from "../api/types";

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

// Grouping is derived client-side (see groupItems), so group_by is deliberately
// not sent - the Rust repository never reads it.
function queryFor(filter: ClipboardFilter): SearchQuery {
  return {
    ...baseQuery,
    content_types: filter === "code" ? codeTypes : [],
    pinned: filter === "pinned" ? true : null,
    favorite: filter === "favorite" ? true : null,
  };
}

// Mirrors queryFor: a live capture is only shown when the backend would have
// returned it for the active filter. Kept beside queryFor so the two cannot drift.
export function matchesFilter(item: LibraryItem, filter: ClipboardFilter): boolean {
  if (item.kind !== "clipboard") return false;
  switch (filter) {
    case "code":
      return codeTypes.includes(item.content_type);
    case "pinned":
      return item.pinned;
    case "favorite":
      return item.favorite;
    default:
      return true;
  }
}

export interface GroupedItems {
  label: string;
  items: LibraryItem[];
}

export type HistoryStatus = "loading" | "ready" | "error";

export interface ClipboardState {
  // History
  items: LibraryItem[];
  groupedItems: GroupedItems[];
  total: number;
  status: HistoryStatus;
  loadingMore: boolean;
  filter: ClipboardFilter;
  groupBy: GroupBy | undefined;

  // Selection
  selectedIds: Set<string>;
  multiSelectMode: boolean;

  // Actions
  loadHistory: () => Promise<void>;
  loadMore: () => Promise<void>;
  setFilter: (filter: ClipboardFilter) => void;
  setGroupBy: (groupBy: GroupBy | undefined) => void;
  prependItem: (item: LibraryItem) => void;
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

function groupItems(items: LibraryItem[], groupBy: GroupBy): GroupedItems[] {
  const groups = new Map<string, LibraryItem[]>();
  
  for (const item of items) {
    let key: string;
    switch (groupBy) {
      case "date": {
        const date = new Date(item.created_at);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
          key = "Today";
        } else if (date.toDateString() === yesterday.toDateString()) {
          key = "Yesterday";
        } else {
          key = new Intl.DateTimeFormat(undefined, { 
            weekday: "long", 
            year: "numeric", 
            month: "long", 
            day: "numeric" 
          }).format(date);
        }
        break;
      }
      case "content_type":
        key = item.content_type.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
        break;
      case "kind":
        key = item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
        break;
      default:
        key = "All Items";
    }
    
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export const useClipboardStore = create<ClipboardState>()(
  subscribeWithSelector((set, get) => ({
    // History state
    items: [],
    groupedItems: [],
    total: 0,
    status: "loading",
    loadingMore: false,
    filter: "all",
    groupBy: undefined,

    // Selection state
    selectedIds: new Set(),
    multiSelectMode: false,

    // History actions
    loadHistory: async () => {
      const requestId = ++historyRequestId;
      const { filter, groupBy } = get();
      set({ status: "loading" });
      try {
        const result = await commands.searchItems(queryFor(filter));
        if (requestId !== historyRequestId) return;
        const grouped = groupBy ? groupItems(result.items, groupBy) : [];
        set({ 
          items: result.items, 
          groupedItems: grouped,
          total: result.total, 
          status: "ready" 
        });
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
        set((state) => {
          const newItems = [
            ...state.items,
            ...result.items.filter(
              (next) => !state.items.some((item) => item.id === next.id),
            ),
          ];
          const grouped = state.groupBy ? groupItems(newItems, state.groupBy) : [];
          return {
            items: newItems,
            groupedItems: grouped,
            total: result.total,
          };
        });
      } catch {
        // Pagination failure: keep existing items, allow retry via scroll.
      } finally {
        set({ loadingMore: false });
      }
    },

    setFilter: (filter) => {
      set({ filter, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    setGroupBy: (groupBy) => {
      set({ groupBy, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    prependItem: (item) => {
      set((state) => {
        if (!matchesFilter(item, state.filter)) return state;
        if (state.items.some((existing) => existing.id === item.id)) return state;
        const items = [item, ...state.items];
        return {
          items,
          groupedItems: state.groupBy ? groupItems(items, state.groupBy) : [],
          total: state.total + 1,
        };
      });
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
    groupedItems: [],
    total: 0,
    status: "loading",
    loadingMore: false,
    filter: "all",
    groupBy: undefined,
    selectedIds: new Set(),
    multiSelectMode: false,
  });
}
