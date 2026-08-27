import { beforeEach, describe, expect, it } from "bun:test";
import type { LibraryItem } from "../api/types";
import { mockTauri } from "../test/setup";
import {
  matchesFilter,
  pageCount,
  resetClipboardStore,
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
    useClipboardStore.setState({ pageSize: 15 });
    seed(
      Array.from({ length: 15 }, (_, index) => ({ ...baseItem, id: `item-${index}` })),
      265,
    );

    useClipboardStore.getState().prependItem({ ...baseItem, id: "live" });

    const { items, total } = useClipboardStore.getState();
    expect(items).toHaveLength(15);
    expect(items[0].id).toBe("live");
    // The row pushed off the end is not lost - it is the first row of page two.
    expect(items.at(-1)?.id).toBe("item-13");
    expect(total).toBe(266);
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
    mockTauri((command, args) => {
      if (command !== "search_items") throw new Error(`Unexpected command: ${command}`);
      const query = (args as { query: { offset: number; limit: number } }).query;
      offsets.push(query.offset);
      return { items: [baseItem], total: 265, limit: query.limit, offset: query.offset };
    });
    seed([baseItem], 265);

    await useClipboardStore.getState().goToPage(4);

    expect(offsets).toEqual([90]);
    expect(useClipboardStore.getState().page).toBe(4);
  });

  it("clamps a page beyond the end of the results", async () => {
    mockTauri((command, args) => {
      if (command !== "search_items") throw new Error(`Unexpected command: ${command}`);
      const query = (args as { query: { offset: number; limit: number } }).query;
      return { items: [baseItem], total: 265, limit: query.limit, offset: query.offset };
    });
    seed([baseItem], 265);

    await useClipboardStore.getState().goToPage(99);

    expect(useClipboardStore.getState().page).toBe(9);
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
