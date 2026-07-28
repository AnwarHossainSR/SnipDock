import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { useClipboardHistory } from "./useClipboardHistory";
import { mockTauri } from "../test/setup";
import type { LibraryItem, Page } from "../api/types";

const baseItem: LibraryItem = {
  id: "1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "test",
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

const mockItems: LibraryItem[] = [
  { ...baseItem, id: "1", content: "test" },
  { ...baseItem, id: "2", content: "code", content_type: "code", language: "ts" },
];

function page(items: LibraryItem[]): Page<LibraryItem> {
  return { items, total: items.length, limit: 100, offset: 0 };
}

describe("useClipboardHistory", () => {
  test("loads history on mount", async () => {
    mockTauri(() => page(mockItems));
    const { result } = renderHook(() => useClipboardHistory("all"));

    expect(result.current.history.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.history.status).toBe("ready");
    });

    expect(result.current.history.items).toHaveLength(2);
    expect(result.current.history.total).toBe(2);
  });

  test("removeItem removes item from list", async () => {
    mockTauri(() => page(mockItems));
    const { result } = renderHook(() => useClipboardHistory("all"));

    await waitFor(() => {
      expect(result.current.history.status).toBe("ready");
    });

    act(() => {
      result.current.removeItem("1");
    });

    expect(result.current.history.items).toHaveLength(1);
    expect(result.current.history.items[0].id).toBe("2");
  });

  test("replaceItem updates item in list", async () => {
    mockTauri(() => page(mockItems));
    const { result } = renderHook(() => useClipboardHistory("all"));

    await waitFor(() => {
      expect(result.current.history.status).toBe("ready");
    });

    act(() => {
      result.current.replaceItem({ ...mockItems[0], pinned: true });
    });

    expect(result.current.history.items[0].pinned).toBe(true);
    expect(result.current.history.items[1].pinned).toBe(false);
  });

  test("removeItems removes multiple items", async () => {
    mockTauri(() => page(mockItems));
    const { result } = renderHook(() => useClipboardHistory("all"));

    await waitFor(() => {
      expect(result.current.history.status).toBe("ready");
    });

    act(() => {
      result.current.removeItems(new Set(["1", "2"]));
    });

    expect(result.current.history.items).toHaveLength(0);
  });
});
