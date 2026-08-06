import { beforeEach, describe, expect, it } from "bun:test";
import type { LibraryItem } from "../api/types";
import { matchesFilter, resetClipboardStore, useClipboardStore } from "./clipboardStore";

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
