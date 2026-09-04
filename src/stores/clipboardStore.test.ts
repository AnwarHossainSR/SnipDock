import { beforeEach, describe, expect, it } from "bun:test";
import type { LibraryItem, SearchQuery } from "../api/types";
import { mockTauri } from "../test/setup";
import {
  DEFAULT_PAGE_SIZE,
  matchesFilter,
  nearestPageSize,
  pageCount,
  resetClipboardStore,
  savableQuery,
  UNKNOWN_SOURCE,
  useClipboardStore,
} from "./clipboardStore";

const baseItem: LibraryItem = {
  id: "item-1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "first capture",
  notes: null,
  content_type: "plain_text",
  language: null,
  project_id: null,
  category_id: null,
  pinned: false,
  favorite: false,
  private: false,
  tag_ids: [],
  archived_at: null,
  expires_at: null,
  usage_count: 0,
  last_used_at: null,
  created_at: "2026-07-17T10:00:00.000Z",
  updated_at: "2026-07-17T10:00:00.000Z",
  source_app: null,
};

function seed(items: LibraryItem[], total = items.length) {
  useClipboardStore.setState({ items, total, status: "ready" });
}

describe("matchesFilter", () => {
  it("accepts every clipboard item under the all filter", () => {
    expect(matchesFilter(baseItem, "all")).toBe(true);
  });

  it("accepts only code content types under the code filter", () => {
    expect(matchesFilter({ ...baseItem, content_type: "sql" }, "code")).toBe(true);
    expect(matchesFilter({ ...baseItem, content_type: "plain_text" }, "code")).toBe(false);
  });

  it("accepts only flagged items under the pinned and favorite filters", () => {
    expect(matchesFilter({ ...baseItem, pinned: true }, "pinned")).toBe(true);
    expect(matchesFilter(baseItem, "pinned")).toBe(false);
    expect(matchesFilter({ ...baseItem, favorite: true }, "favorite")).toBe(true);
    expect(matchesFilter(baseItem, "favorite")).toBe(false);
  });

  it("treats an empty or undefined source_apps list as no filter", () => {
    expect(matchesFilter(baseItem, "all", [])).toBe(true);
    expect(matchesFilter({ ...baseItem, source_app: "code.exe" }, "all", undefined)).toBe(true);
  });

  it("accepts a recorded source_app that matches the source_apps list", () => {
    const item = { ...baseItem, source_app: "code.exe" };
    expect(matchesFilter(item, "all", ["code.exe"])).toBe(true);
    expect(matchesFilter(item, "all", ["code.exe", "other.exe"])).toBe(true);
  });

  it("rejects a recorded source_app that is not in the source_apps list", () => {
    const item = { ...baseItem, source_app: "code.exe" };
    expect(matchesFilter(item, "all", ["other.exe"])).toBe(false);
  });

  it("rejects a capture with no recorded source_app when the filter is non-empty", () => {
    expect(matchesFilter(baseItem, "all", ["code.exe"])).toBe(false);
  });
});

describe("prependItem", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("inserts a capture at the head and bumps the total", () => {
    seed([baseItem], 265);

    useClipboardStore.getState().prependItem({ ...baseItem, id: "item-2", content: "newest" });

    const { items, total } = useClipboardStore.getState();
    expect(items.map((item) => item.id)).toEqual(["item-2", "item-1"]);
    expect(total).toBe(266);
  });

  it("ignores an id that is already loaded", () => {
    seed([baseItem], 1);

    useClipboardStore.getState().prependItem(baseItem);

    const { items, total } = useClipboardStore.getState();
    expect(items).toHaveLength(1);
    expect(total).toBe(1);
  });

  it("drops an unpinned capture while the pinned filter is active", () => {
    useClipboardStore.setState({ filter: "pinned" });
    seed([{ ...baseItem, pinned: true }], 1);

    useClipboardStore.getState().prependItem({ ...baseItem, id: "item-2" });

    expect(useClipboardStore.getState().items).toHaveLength(1);
    expect(useClipboardStore.getState().total).toBe(1);
  });

  it("drops a non-code capture while the code filter is active", () => {
    useClipboardStore.setState({ filter: "code" });
    seed([{ ...baseItem, content_type: "code" }], 1);

    useClipboardStore.getState().prependItem({ ...baseItem, id: "item-2", content_type: "plain_text" });
    expect(useClipboardStore.getState().items).toHaveLength(1);

    useClipboardStore.getState().prependItem({ ...baseItem, id: "item-3", content_type: "json" });
    expect(useClipboardStore.getState().items.map((item) => item.id)).toEqual(["item-3", "item-1"]);
  });

  it("only raises the total while a later page is on screen", () => {
    // Page two is what the user is reading. Inserting the new item there would
    // shift every row down by one; it belongs at the top of page one.
    useClipboardStore.setState({ page: 2 });
    seed([{ ...baseItem, id: "item-31" }], 265);

    useClipboardStore.getState().prependItem({ ...baseItem, id: "live" });

    const { items, total } = useClipboardStore.getState();
    expect(items.map((item) => item.id)).toEqual(["item-31"]);
    expect(total).toBe(266);
  });

  it("keeps page one at its page size", () => {
    useClipboardStore.setState({ pageSize: 100 });
    seed(
      Array.from({ length: 100 }, (_, index) => ({ ...baseItem, id: `item-${index}` })),
      265,
    );

    useClipboardStore.getState().prependItem({ ...baseItem, id: "live" });

    const { items, total } = useClipboardStore.getState();
    expect(items).toHaveLength(100);
    expect(items[0].id).toBe("live");
    // The row pushed off the end is not lost - it is the first row of page two.
    expect(items.at(-1)?.id).toBe("item-98");
    expect(total).toBe(266);
  });

  it("snaps a stored rows-per-page onto an offered size", () => {
    // Sizes offered by the control changed once already, and a stored value
    // outside the list would leave no button showing as selected.
    expect(nearestPageSize(25)).toBe(100);
    expect(nearestPageSize(60)).toBe(100);
    expect(nearestPageSize(100)).toBe(100);
    expect(nearestPageSize(160)).toBe(200);
    expect(nearestPageSize(5_000)).toBe(200);
    expect(nearestPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("re-derives groups when grouping is active", () => {
    useClipboardStore.setState({ groupBy: "content_type" });
    seed([{ ...baseItem, content_type: "code" }], 1);
    useClipboardStore.setState({
      groupedItems: [{ label: "Code", items: [{ ...baseItem, content_type: "code" }] }],
    });

    useClipboardStore.getState().prependItem({ ...baseItem, id: "item-2", content_type: "json" });

    const { groupedItems } = useClipboardStore.getState();
    expect(groupedItems.map((group) => [group.label, group.items.length])).toEqual([
      ["Json", 1],
      ["Code", 1],
    ]);
  });
});

describe("replaceItem", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("re-derives the groups so a flag change shows while grouping is active", () => {
    useClipboardStore.setState({ groupBy: "content_type" });
    seed([baseItem], 1);
    useClipboardStore.setState({
      groupedItems: [{ label: "Plain text", items: [baseItem] }],
    });

    useClipboardStore.getState().replaceItem({ ...baseItem, pinned: true });

    const { items, groupedItems } = useClipboardStore.getState();
    expect(items[0].pinned).toBe(true);
    // The grouped view renders from these rows, so the flag has to land here too.
    expect(groupedItems[0].items[0].pinned).toBe(true);
  });
});

describe("pageCount", () => {
  it("rounds a partial last page up", () => {
    expect(pageCount(265, 30)).toBe(9);
    expect(pageCount(60, 30)).toBe(2);
  });

  it("never reports fewer than one page", () => {
    expect(pageCount(0, 30)).toBe(1);
  });
});

describe("paging", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("requests the offset of the page it was asked for", async () => {
    const offsets: number[] = [];
    useClipboardStore.setState({ pageSize: 100 });
    mockTauri((command, args) => {
      if (command !== "search_items") throw new Error(`Unexpected command: ${command}`);
      const query = (args as { query: { offset: number; limit: number } }).query;
      offsets.push(query.offset);
      return { items: [baseItem], total: 1_000, limit: query.limit, offset: query.offset };
    });
    seed([baseItem], 1_000);

    await useClipboardStore.getState().goToPage(4);

    expect(offsets).toEqual([300]);
    expect(useClipboardStore.getState().page).toBe(4);
  });

  it("clamps a page beyond the end of the results", async () => {
    useClipboardStore.setState({ pageSize: 100 });
    mockTauri((command, args) => {
      if (command !== "search_items") throw new Error(`Unexpected command: ${command}`);
      const query = (args as { query: { offset: number; limit: number } }).query;
      return { items: [baseItem], total: 265, limit: query.limit, offset: query.offset };
    });
    seed([baseItem], 265);

    await useClipboardStore.getState().goToPage(99);

    // 265 items at 100 a page is 3 pages, and the last one is as far as it goes.
    expect(useClipboardStore.getState().page).toBe(3);
  });

  it("drops back a page when the last row of the last page is deleted", async () => {
    let requestedOffset = -1;
    mockTauri((command, args) => {
      if (command !== "search_items") throw new Error(`Unexpected command: ${command}`);
      const query = (args as { query: { offset: number; limit: number } }).query;
      requestedOffset = query.offset;
      return { items: [baseItem], total: 30, limit: query.limit, offset: query.offset };
    });
    // Page two holds a single row; deleting it leaves 30 items, all on page one.
    useClipboardStore.setState({ page: 2 });
    seed([{ ...baseItem, id: "last" }], 31);

    useClipboardStore.getState().removeItem("last");

    await Bun.sleep(0);
    expect(useClipboardStore.getState().page).toBe(1);
    expect(requestedOffset).toBe(0);
  });
});

describe("saved searches", () => {
  const folderQuery: SearchQuery = {
    text: null,
    kinds: ["clipboard"],
    content_types: ["image"],
    languages: [],
    project_ids: [],
    category_ids: [],
    tag_ids: [],
    pinned: null,
    favorite: true,
    created_from: null,
    created_to: null,
    sort: "newest",
    limit: 100,
    offset: 0,
  };

  /** Waits for the store's fetches to settle without polling on a timer. */
  async function settle() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  beforeEach(() => {
    resetClipboardStore();
  });

  it("sends the folder's own predicate instead of the filter pills", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "Screenshots",
      query: folderQuery,
      source: "folder",
    });
    await settle();

    expect(queries).toHaveLength(1);
    expect(queries[0].content_types).toEqual(["image"]);
    expect(queries[0].favorite).toBe(true);
    // Paging still belongs to the page, not to the stored folder.
    expect(queries[0].offset).toBe(0);
  });

  it("closes the open folder when a filter pill is picked", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "Screenshots",
      query: folderQuery,
      source: "folder",
    });
    await settle();
    useClipboardStore.getState().setFilter("pinned");
    await settle();

    expect(useClipboardStore.getState().savedSearch).toBeNull();
    expect(queries[queries.length - 1].pinned).toBe(true);
    expect(queries[queries.length - 1].content_types).toEqual([]);
  });

  it("does not guess a fresh capture into a folder's results", () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    useClipboardStore.setState({
      savedSearch: { id: "folder-1", name: "Screenshots", query: folderQuery, source: "folder" },
      items: [],
      total: 0,
      status: "ready",
    });

    useClipboardStore.getState().prependItem({ ...baseItem, id: "fresh", content_type: "image" });

    // The folder's predicate lives in the backend; the store cannot evaluate it.
    expect(useClipboardStore.getState().items).toHaveLength(0);
    expect(useClipboardStore.getState().total).toBe(0);
  });
});

describe("sort order", () => {
  /** Waits for the store's fetches to settle without polling on a timer. */
  async function settle() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  beforeEach(() => {
    resetClipboardStore();
  });

  it("asks for newest first until told otherwise", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    void useClipboardStore.getState().loadHistory();
    await settle();

    expect(queries[0].sort).toBe("newest");
  });

  it("floats the kept captures when pinned-first is chosen", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().setSort("pinned_first");
    await settle();

    expect(queries[queries.length - 1].sort).toBe("pinned_first");
  });

  it("orders an open smart folder too, since order is a view preference", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().setSort("pinned_first");
    await settle();
    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "Screenshots",
      source: "folder",
      query: {
        text: null,
        kinds: ["clipboard"],
        content_types: ["image"],
        languages: [],
        project_ids: [],
        category_ids: [],
        tag_ids: [],
        pinned: null,
        favorite: null,
        created_from: null,
        created_to: null,
        sort: "oldest",
        limit: 100,
        offset: 0,
        source_apps: [],
      },
    });
    await settle();

    const last = queries[queries.length - 1];
    expect(last.content_types).toEqual(["image"]);
    expect(last.sort).toBe("pinned_first");
  });
});

describe("source-app filter", () => {
  const folderQuery: SearchQuery = {
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
    limit: 100,
    offset: 0,
    source_apps: ["code.exe"],
  };

  async function settle() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  beforeEach(() => {
    resetClipboardStore();
  });

  it("forwards the saved search's source_apps to the outgoing query", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "From code.exe",
      query: folderQuery,
      source: "folder",
    });
    await settle();

    expect(queries).toHaveLength(1);
    expect(queries[0].source_apps).toEqual(["code.exe"]);
  });
});

describe("searchMode", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("defaults to literal", () => {
    expect(useClipboardStore.getState().searchMode).toBe("literal");
  });

  it("setSearchMode updates the store", () => {
    useClipboardStore.getState().setSearchMode("regex");
    expect(useClipboardStore.getState().searchMode).toBe("regex");
  });

  it("setSearchMode is a no-op when the value is unchanged", () => {
    useClipboardStore.getState().setSearchMode("regex");
    const before = useClipboardStore.getState();
    useClipboardStore.getState().setSearchMode("regex");
    const after = useClipboardStore.getState();
    expect(after).toBe(before);
  });

  it("applySavedSearch restores Regex mode when the saved query carries a regex", () => {
    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "Regex pins",
      source: "folder",
      query: {
        text: null,
        kinds: ["clipboard"],
        content_types: [],
        languages: [],
        project_ids: [],
        category_ids: [],
        tag_ids: [],
        pinned: true,
        favorite: null,
        created_from: null,
        created_to: null,
        sort: "newest",
        limit: 100,
        offset: 0,
        source_apps: [],
        regex: "v\\d+",
        regex_case_insensitive: null,
      },
    });
    expect(useClipboardStore.getState().searchMode).toBe("regex");
  });

  it("applySavedSearch keeps Literal mode when the saved query has no regex", () => {
    useClipboardStore.getState().setSearchMode("regex");
    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "Plain pins",
      source: "folder",
      query: {
        text: null,
        kinds: ["clipboard"],
        content_types: [],
        languages: [],
        project_ids: [],
        category_ids: [],
        tag_ids: [],
        pinned: true,
        favorite: null,
        created_from: null,
        created_to: null,
        sort: "newest",
        limit: 100,
        offset: 0,
        source_apps: [],
      },
    });
    expect(useClipboardStore.getState().searchMode).toBe("literal");
  });

  it("clearSavedSearch returns the mode to Literal", () => {
    useClipboardStore.getState().applySavedSearch({
      id: "folder-1",
      name: "Regex pins",
      source: "folder",
      query: {
        text: null,
        kinds: ["clipboard"],
        content_types: [],
        languages: [],
        project_ids: [],
        category_ids: [],
        tag_ids: [],
        pinned: true,
        favorite: null,
        created_from: null,
        created_to: null,
        sort: "newest",
        limit: 100,
        offset: 0,
        source_apps: [],
        regex: "v\\d+",
      },
    });
    useClipboardStore.getState().clearSavedSearch();
    expect(useClipboardStore.getState().searchMode).toBe("literal");
  });

  it("savableQuery records the active mode in the saved folder", () => {
    const literal = savableQuery("all");
    expect(literal.regex).toBeUndefined();

    useClipboardStore.getState().setSearchMode("regex");
    const regex = savableQuery("all");
    expect(regex.regex).toBeNull();
  });
});

describe("source-app filter", () => {
  async function settle() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  beforeEach(() => {
    resetClipboardStore();
  });

  it("treats the unknown sentinel as 'items with no recorded source'", () => {
    expect(matchesFilter(baseItem, "all", [UNKNOWN_SOURCE])).toBe(true);
    expect(matchesFilter({ ...baseItem, source_app: "code.exe" }, "all", [UNKNOWN_SOURCE])).toBe(false);
  });

  it("sends the source_apps list to the backend on the next fetch", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().setSourceApps(["code.exe"]);
    await settle();

    const last = queries[queries.length - 1];
    expect(last.source_apps).toEqual(["code.exe"]);
  });

  it("sends an empty list (no filter) when the active value is cleared", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      return undefined;
    });

    useClipboardStore.getState().setSourceApps(["code.exe"]);
    await settle();
    useClipboardStore.getState().setSourceApps(null);
    await settle();

    const last = queries[queries.length - 1];
    expect(last.source_apps).toEqual([]);
  });

  it("does not prepend a live capture whose source does not match the active filter", () => {
    useClipboardStore.setState({ sourceApps: ["code.exe"] });
    seed([], 0);

    useClipboardStore.getState().prependItem({ ...baseItem, id: "live", source_app: "firefox" });
    expect(useClipboardStore.getState().items).toHaveLength(0);
  });

  it("saves the active source filter into the folder's query", () => {
    useClipboardStore.getState().setSourceApps(["code.exe"]);
    const query = savableQuery("all");
    expect(query.source_apps).toEqual(["code.exe"]);
  });
});
