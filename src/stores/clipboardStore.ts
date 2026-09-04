import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { commands } from "../api/commands";
import { clipboardQuery } from "../lib/searchQuery";
import type { ContentType, GroupBy, LibraryItem, SearchMode, SearchQuery, SortOrder } from "../api/types";

/**
 * Sentinel for "items with no recorded source app". Stored as a one-element
 * list (`[UNKNOWN_SOURCE]`) on `sourceApps` so the existing `source_apps`
 * filter handles it the same way a named executable does, without growing
 * the `SearchQuery` schema.
 */
export const UNKNOWN_SOURCE = "__unknown__" as const;

export type SourceAppFilter = readonly string[] | null;

function sourceAppSearchValue(filter: SourceAppFilter | undefined): string[] {
  if (!filter || filter.length === 0) return [];
  return filter.map((entry) => (entry === UNKNOWN_SOURCE ? "" : entry));
}

export type ClipboardFilter = "all" | "code" | "image" | "pinned" | "favorite";

/**
 * Rows per page, offered in the pager's size control. 100 is the floor: the
 * history is read in long sweeps, and the smaller steps only made the pager
 * work harder for the same scroll. 200 is the ceiling because the repository
 * clamps a search there, so a larger page would show fewer rows than the
 * pager claims.
 */
export const PAGE_SIZES = [100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 100;

/** The nearest offered size to a stored value, so a hand-edited or older
 *  setting still lands on a size the control can show as selected. */
export function nearestPageSize(value: number | undefined): PageSize {
  if (!value || !Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return PAGE_SIZES.reduce((closest, size) =>
    Math.abs(size - value) < Math.abs(closest - value) ? size : closest,
  );
}

const codeTypes: ContentType[] = [
  "code", "json", "sql", "html", "css", "xml", "shell", "markdown", "config",
];

function contentTypesFor(filter: ClipboardFilter): ContentType[] {
  if (filter === "code") return codeTypes;
  if (filter === "image") return ["image"];
  return [];
}

const baseQuery = clipboardQuery({ limit: DEFAULT_PAGE_SIZE });

/**
 * A stored predicate the user opened from the sidebar, driving the history
 * view: a smart folder they saved, or one of their tags or projects. `source`
 * is what tells a folder - which can be renamed and deleted - apart from a tag
 * or project view, which cannot be deleted from the history screen.
 */
export interface AppliedSearch {
  id: string;
  name: string;
  query: SearchQuery;
  source: "folder" | "tag" | "project";
}

// Grouping is derived client-side (see groupItems), so group_by is deliberately
// not sent - the Rust repository never reads it.
function queryFor(
  filter: ClipboardFilter,
  page: number,
  pageSize: number,
  saved?: AppliedSearch | null,
  sort: SortOrder = "newest",
  sourceApps?: SourceAppFilter,
): SearchQuery {
  // A saved search carries its own predicate, so the filter pills step aside
  // while one is open rather than intersecting with it silently. Paging and
  // the clipboard kind still come from here: the folder describes what to
  // match, this page describes how much of it to fetch.
  if (saved) {
    return {
      ...baseQuery,
      ...saved.query,
      kinds: saved.query.kinds.length > 0 ? saved.query.kinds : baseQuery.kinds,
      // A folder stores what to match; how to order it is a view preference,
      // so it stays with the page like paging does.
      sort,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
  }
  return {
    ...baseQuery,
    content_types: contentTypesFor(filter),
    pinned: filter === "pinned" ? true : null,
    favorite: filter === "favorite" ? true : null,
    source_apps: sourceAppSearchValue(sourceApps),
    sort,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

/**
 * The predicate the history view is showing right now, without paging, so it
 * can be stored as a smart folder and replayed later.
 *
 * Reads the current `searchMode` from the store so the saved query records
 * whether it was a Regex search; on reopen, `applySavedSearch` will restore
 * the mode from the `regex` field.
 */
export function savableQuery(filter: ClipboardFilter): SearchQuery {
  const base = {
    ...queryFor(
      filter,
      1,
      DEFAULT_PAGE_SIZE,
      undefined,
      "newest",
      useClipboardStore.getState().sourceApps,
    ),
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
  };
  const mode = useClipboardStore.getState().searchMode;
  // Literal searches are recorded as the absence of a `regex` field, the
  // same shape older saved searches already use.
  if (mode === "literal") {
    const { regex: _regex, regex_case_insensitive: _ci, ...rest } = base;
    return rest;
  }
  return base;
}

// Mirrors queryFor: a live capture is only shown when the backend would have
// returned it for the active filter. Kept beside queryFor so the two cannot drift.
export function matchesFilter(
  item: LibraryItem,
  filter: ClipboardFilter,
  sourceApps?: SourceAppFilter,
): boolean {
  if (item.kind !== "clipboard") return false;
  let passesFilter = false;
  switch (filter) {
    case "code":
      passesFilter = codeTypes.includes(item.content_type);
      break;
    case "image":
      passesFilter = item.content_type === "image";
      break;
    case "pinned":
      passesFilter = item.pinned;
      break;
    case "favorite":
      passesFilter = item.favorite;
      break;
    default:
      passesFilter = true;
  }
  if (!passesFilter) return false;
  // A non-empty list is a hard filter: items without a recorded source are
  // dropped, items with a source only pass when it appears in the list. An
  // empty or undefined list imposes no constraint. The Unknown sentinel
  // matches items with no recorded source; a named entry matches the
  // recorded executable name exactly.
  if (sourceApps && sourceApps.length > 0) {
    if (sourceApps.includes(UNKNOWN_SOURCE)) {
      if (item.source_app) {
        if (!sourceApps.includes(item.source_app)) return false;
      }
    } else if (!item.source_app) {
      return false;
    } else if (!sourceApps.includes(item.source_app)) {
      return false;
    }
  }
  return true;
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
  /** Non-null while a smart folder is open; it replaces the filter pills. */
  savedSearch: AppliedSearch | null;
  /** "pinned_first" floats the kept captures; otherwise strictly by date. */
  sort: SortOrder;
  groupBy: GroupBy | undefined;
  /** Per-session search-mode toggle. Drives the mode indicator next to the
   *  search input and tells the outgoing SearchQuery whether to carry a
   *  `regex` field. Defaults to `literal` so an empty pattern stays a
   *  literal search. */
  searchMode: SearchMode;
  /** Active source-app filter from the sidebar / toolbar; `null` means "all
   *  sources". A one-element list with the `UNKNOWN_SOURCE` sentinel asks
   *  for items with no recorded source app. */
  sourceApps: SourceAppFilter;

  // Selection
  selectedIds: Set<string>;
  multiSelectMode: boolean;
  focusRequest: FocusRequest | null;

  // Actions
  loadHistory: () => Promise<void>;
  /**
   * Puts the history back the way it opens: no filter, no smart folder, no
   * source-app narrowing, newest first, ungrouped, page one, nothing
   * selected. The rows are dropped and the status returns to `loading`, so
   * the panel shows its spinner rather than the stale page while the fresh
   * one is fetched. `pageSize` goes back to the default too; the caller
   * re-applies the stored preference before loading.
   */
  resetView: () => void;
  goToPage: (page: number) => Promise<void>;
  setPageSize: (pageSize: PageSize) => void;
  /** Applies the stored rows-per-page before the first fetch. */
  hydratePageSize: (value: number | undefined) => void;
  setFilter: (filter: ClipboardFilter) => void;
  /** Opens a smart folder, replacing whatever filter was showing. */
  applySavedSearch: (search: AppliedSearch) => void;
  /** Closes the open smart folder and returns to the All filter. */
  clearSavedSearch: () => void;
  setSort: (sort: SortOrder) => void;
  setGroupBy: (groupBy: GroupBy | undefined) => void;
  setSearchMode: (mode: SearchMode) => void;
  setSourceApps: (sourceApps: SourceAppFilter) => void;
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
    savedSearch: null,
    sort: "newest",
    groupBy: undefined,
    searchMode: "literal",
    sourceApps: null,

    // Selection state
    selectedIds: new Set(),
    multiSelectMode: false,
    focusRequest: null,

    // History actions
    loadHistory: async () => {
      const requestId = ++historyRequestId;
      const { filter, groupBy, page, pageSize, savedSearch, sort, sourceApps } = get();
      set({ status: "loading" });
      try {
        const result = await commands.searchItems(
          queryFor(filter, page, pageSize, savedSearch, sort, sourceApps),
        );
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

    resetView: () => {
      // Any in-flight fetch belongs to the view being discarded, so retire its
      // request id: a late response must not repopulate the panel.
      historyRequestId++;
      set({
        items: [],
        groupedItems: [],
        total: 0,
        status: "loading",
        paging: false,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        filter: "all",
        savedSearch: null,
        sort: "newest",
        groupBy: undefined,
        searchMode: "literal",
        sourceApps: null,
        selectedIds: new Set(),
        multiSelectMode: false,
        focusRequest: null,
      });
    },

    // Unlike loadHistory this keeps the outgoing page rendered while the next
    // one is fetched, so paging does not blank the panel between clicks.
    goToPage: async (page) => {
      const { filter, pageSize, total, page: current, savedSearch, sort, sourceApps } = get();
      const target = Math.min(Math.max(1, Math.trunc(page)), pageCount(total, pageSize));
      if (target === current) return;
      const requestId = ++historyRequestId;
      set({ paging: true, page: target, selectedIds: new Set(), multiSelectMode: false });
      try {
        const result = await commands.searchItems(
          queryFor(filter, target, pageSize, savedSearch, sort, sourceApps),
        );
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
      // Persisted so the choice survives a restart. Failure is ignored: the
      // size still applies to this session, and a settings write is not worth
      // an error over the list the user is looking at.
      void commands.saveSettings({ values: { clipboard_page_size: pageSize } }).catch(() => {});
    },

    /**
     * Applies the stored rows-per-page before the first fetch, so the opening
     * page is the size the user chose rather than the default followed by a
     * second request.
     */
    hydratePageSize: (value) => {
      const pageSize = nearestPageSize(value);
      if (get().pageSize === pageSize) return;
      set({ pageSize, page: 1 });
    },

    setFilter: (filter) => {
      // Picking a pill is how the user leaves a smart folder.
      set({ filter, savedSearch: null, page: 1, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    applySavedSearch: (search) => {
      // A saved query that carries a `regex` field was saved in Regex mode;
      // opening it should land the search box in the same mode the user
      // closed it in. `savableQuery` keeps the field (even as `null`, when
      // the box was empty) for a Regex search and strips it entirely for a
      // Literal one, so presence - not truthiness - is the signal.
      const mode: SearchMode = "regex" in search.query ? "regex" : "literal";
      set({
        savedSearch: search,
        searchMode: mode,
        page: 1,
        items: [],
        groupedItems: [],
        total: 0,
        status: "loading",
        selectedIds: new Set(),
        multiSelectMode: false,
      });
      get().loadHistory();
    },

    clearSavedSearch: () => {
      if (!get().savedSearch) return;
      set({ savedSearch: null, searchMode: "literal", filter: "all", page: 1, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    setSort: (sort) => {
      if (get().sort === sort) return;
      set({ sort, page: 1, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    setGroupBy: (groupBy) => {
      set({ groupBy, page: 1, items: [], groupedItems: [], total: 0, status: "loading", selectedIds: new Set(), multiSelectMode: false });
      get().loadHistory();
    },

    /**
     * Switches the search box's mode. The mode is held in the store rather
     * than each input so it survives navigating between Clipboard and
     * Quick Paste; an explicit `setSearchMode` is what both pages call when
     * the user clicks a segment.
     */
    setSearchMode: (mode) => {
      if (get().searchMode === mode) return;
      set({ searchMode: mode });
    },

    setSourceApps: (sourceApps) => {
      // Empty list and null both mean "no filter"; treat them as one to keep
      // the setter idempotent and avoid an extra fetch when a sidebar entry
      // is deactivated.
      const next: SourceAppFilter =
        sourceApps && sourceApps.length > 0 ? sourceApps : null;
      if (get().sourceApps === next) return;
      set({
        sourceApps: next,
        page: 1,
        items: [],
        groupedItems: [],
        total: 0,
        status: "loading",
        selectedIds: new Set(),
        multiSelectMode: false,
      });
      get().loadHistory();
    },

    prependItem: (item) => {
      set((state) => {
        // A smart folder's predicate lives in the backend, so there is nothing
        // here that can say whether a fresh capture belongs in it. Leave the
        // results as fetched rather than guessing.
        if (state.savedSearch) return state;
        if (!matchesFilter(item, state.filter, state.sourceApps)) return state;
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
      set((state) => {
        const items = state.items.map((item) =>
          item.id === updated.id ? updated : item,
        );
        // The grouped view renders from `groupedItems`, so leaving it on the
        // old row is what made a pin or favorite toggle look like it had not
        // taken while a grouping was active.
        return {
          items,
          groupedItems: state.groupBy ? groupItems(items, state.groupBy) : [],
        };
      });
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
  // Same shape as the Refresh control's reset, kept as one implementation so
  // a field added to the view state cannot be forgotten in one of them.
  useClipboardStore.getState().resetView();
}
