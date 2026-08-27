import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { commands } from "../api/commands";
import type { ContentType, GroupBy, LibraryItem, SearchQuery } from "../api/types";

export type ClipboardFilter = "all" | "code" | "pinned" | "favorite";

/** Rows per page, offered in the pager's size control. */
export const PAGE_SIZES = [15, 30, 60, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 30;

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
  limit: DEFAULT_PAGE_SIZE,
  offset: 0,
};

// Grouping is derived client-side (see groupItems), so group_by is deliberately
// not sent - the Rust repository never reads it.
function queryFor(filter: ClipboardFilter, page: number, pageSize: number): SearchQuery {
  return {
    ...baseQuery,
    content_types: filter === "code" ? codeTypes : [],
    pinned: filter === "pinned" ? true : null,
    favorite: filter === "favorite" ? true : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
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

/** Total pages for a result set, never below one so the pager always reads `1 of 1`. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export interface GroupedItems {
  label: string;
  items: LibraryItem[];
}

export type HistoryStatus = "loading" | "ready" | "error";

/**
 * A request to bring one item into view on the Clipboard page, raised from
 * outside that page (today: the sidebar's Pinned list). The token makes two
 * consecutive requests for the same item distinct, so clicking the same entry
 * twice re-focuses it instead of being swallowed as an unchanged value.
 */
export interface FocusRequest {
  id: string;
  token: number;
}

let focusToken = 0;

export interface ClipboardState {
  // History: `items` holds exactly the rows of the current page.
  items: LibraryItem[];
  groupedItems: GroupedItems[];
  total: number;
  status: HistoryStatus;
  /** A page change is in flight. The outgoing page stays on screen meanwhile. */
  paging: boolean;
  page: number;
  pageSize: PageSize;
  filter: ClipboardFilter;
  groupBy: GroupBy | undefined;

  // Selection
  selectedIds: Set<string>;
  multiSelectMode: boolean;
  focusRequest: FocusRequest | null;

  // Actions
  loadHistory: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  setPageSize: (pageSize: PageSize) => void;
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
  requestFocusItem: (id: string) => void;
  clearFocusRequest: () => void;
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
    paging: false,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    filter: "all",
    groupBy: undefined,

    // Selection state
    selectedIds: new Set(),
    multiSelectMode: false,
    focusRequest: null,

    // History actions
    loadHistory: async () => {
      const requestId = ++historyRequestId;
      const { filter, groupBy, page, pageSize } = get();
      set({ status: "loading" });
      try {
        const result = await commands.searchItems(queryFor(filter, page, pageSize));
        if (requestId !== historyRequestId) return;
        const grouped = groupBy ? groupItems(result.items, groupBy) : [];
        set({
          items: result.items,
          groupedItems: grouped,
          total: result.total,
          status: "ready",
          paging: false,
        });
      } catch {
        if (requestId !== historyRequestId) return;
        set({ status: "error", paging: false });
      }
    },

    // Unlike loadHistory this keeps the outgoing page rendered while the next
    // one is fetched, so paging does not blank the panel between clicks.
    goToPage: async (page) => {
      const { filter, pageSize, total, page: current } = get();
      const target = Math.min(Math.max(1, Math.trunc(page)), pageCount(total, pageSize));
      if (target === current) return;
      const requestId = ++historyRequestId;
      set({ paging: true, page: target, selectedIds: new Set(), multiSelectMode: false });
      try {
        const result = await commands.searchItems(queryFor(filter, target, pageSize));
        if (requestId !== historyRequestId) return;
        set((state) => ({
          items: result.items,
          groupedItems: state.groupBy ? groupItems(result.items, state.groupBy) : [],
          total: result.total,
          status: "ready",
          paging: false,
        }));
      } catch {
        if (requestId !== historyRequestId) return;
        set({ status: "error", paging: false });
      }
    },

    setPageSize: (pageSize) => {
      if (get().pageSize === pageSize) return;
      set({ pageSize, page: 1, selectedIds: new Set(), multiSelectMode: false });
      void get().loadHistory();
    },

    setFilter: (filter) => {
      set({ filter, page: 1, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    setGroupBy: (groupBy) => {
      set({ groupBy, page: 1, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    prependItem: (item) => {
      set((state) => {
        if (!matchesFilter(item, state.filter)) return state;
        if (state.items.some((existing) => existing.id === item.id)) return state;
        // A new item belongs at the top of page one. On any later page the
        // count still grows, but the rows the user is reading are left alone
        // rather than shifting by one under the cursor.
        if (state.page !== 1) return { total: state.total + 1 };
        const items = [item, ...state.items].slice(0, state.pageSize);
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
      get().removeItems(new Set([id]));
    },

    removeItems: (ids) => {
      const before = get();
      set((state) => {
        const selectedIds = new Set(state.selectedIds);
        for (const id of ids) selectedIds.delete(id);
        const items = state.items.filter((item) => !ids.has(item.id));
        return {
          items,
          groupedItems: state.groupBy ? groupItems(items, state.groupBy) : [],
          total: Math.max(0, state.total - ids.size),
          selectedIds,
          multiSelectMode: selectedIds.size > 0 && state.multiSelectMode,
        };
      });
      // Deleting the last row of a page would otherwise leave an empty panel
      // with a pager still pointing at it. Fall back to the page that now
      // holds the end of the list.
      const after = get();
      if (after.items.length > 0 || after.total === 0) return;
      const last = pageCount(after.total, after.pageSize);
      if (before.page > last) void after.goToPage(last);
      else void after.loadHistory();
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

    requestFocusItem: (id) => {
      set({ focusRequest: { id, token: ++focusToken } });
    },

    clearFocusRequest: () => {
      set({ focusRequest: null });
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
    paging: false,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    filter: "all",
    groupBy: undefined,
    selectedIds: new Set(),
    multiSelectMode: false,
    focusRequest: null,
  });
}
