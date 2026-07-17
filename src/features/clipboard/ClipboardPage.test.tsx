import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { LibraryItem, Page } from "../../lib/types";
import { mockTauri } from "../../test/setup";
import ClipboardPage from "./ClipboardPage";

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
  archived_at: null,
  expires_at: null,
  usage_count: 0,
  last_used_at: null,
  created_at: "2026-07-17T10:00:00.000Z",
  updated_at: "2026-07-17T10:00:00.000Z",
};

function page(items: LibraryItem[]): Page<LibraryItem> {
  return { items, total: items.length, limit: 100, offset: 0 };
}

describe("ClipboardPage", () => {
  it("loads clipboard history newest first and renders content as text", async () => {
    const dangerous = {
      ...baseItem,
      id: "newest",
      content: '<img src="x" alt="injected">',
      content_type: "html" as const,
      created_at: "2026-07-17T11:00:00.000Z",
    };
    let receivedQuery: unknown;

    mockTauri((command, args) => {
      expect(command).toBe("search_items");
      receivedQuery = (args as { query?: unknown } | undefined)?.query;
      return page([dangerous, baseItem]);
    });

    const { container } = render(<ClipboardPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading history");
    const rows = await screen.findAllByRole("option");

    expect(receivedQuery).toMatchObject({
      kinds: ["clipboard"],
      sort: "newest",
      limit: 100,
      offset: 0,
    });
    expect(rows.map((row) => row.id)).toEqual([
      "clipboard-item-newest",
      "clipboard-item-item-1",
    ]);
    expect(within(rows[0]).getByText(dangerous.content)).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("2 items")).toBeDefined();
    expect(screen.getByText("Tracking active")).toBeDefined();
  });

  it("shows empty and error states", async () => {
    mockTauri(() => page([]));
    const { unmount } = render(<ClipboardPage />);

    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
    unmount();

    mockTauri(() => {
      throw new Error("database unavailable");
    });
    render(<ClipboardPage />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Clipboard history unavailable",
    );
  });

  it("reports paused tracking", async () => {
    mockTauri(() => page([]));
    render(<ClipboardPage trackingPaused />);

    expect(await screen.findByText("Tracking paused")).toBeDefined();
  });

  it("moves row selection with arrow, home, and end keys", async () => {
    const second = {
      ...baseItem,
      id: "item-2",
      content: "second capture",
      created_at: "2026-07-17T09:00:00.000Z",
    };
    const third = {
      ...baseItem,
      id: "item-3",
      content: "third capture",
      created_at: "2026-07-17T08:00:00.000Z",
    };
    mockTauri(() => page([baseItem, second, third]));
    render(<ClipboardPage />);

    const rows = await screen.findAllByRole("option");
    act(() => rows[0].focus());
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(rows[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: "End" });
    expect(rows[2].getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(rows[2], { key: "ArrowUp" });
    expect(rows[1].getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(rows[1], { key: "Home" });
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
  });
});
