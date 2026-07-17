import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("copies an item with one click", async () => {
    let copyArgs: unknown;
    mockTauri((command, args) => {
      if (command === "search_items") return page([baseItem]);
      if (command === "copy_item") {
        copyArgs = args;
        return {
          item_id: baseItem.id,
          copied_at: "2026-07-17T12:00:00.000Z",
          auto_clear_at: null,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Copy item" }));

    expect(await screen.findByText("Copied to clipboard")).toBeDefined();
    expect(copyArgs).toEqual({ id: baseItem.id, mode: "raw" });
  });

  it("pins, favorites, and deletes from the item action menu", async () => {
    let item = baseItem;
    const calls: string[] = [];
    mockTauri((command, args) => {
      calls.push(command);
      if (command === "search_items") return page([item]);
      if (command === "set_item_flags") {
        const flags = (args as { flags: { pinned: boolean | null; favorite: boolean | null } })
          .flags;
        item = {
          ...item,
          pinned: flags.pinned ?? item.pinned,
          favorite: flags.favorite ?? item.favorite,
        };
        return item;
      }
      if (command === "delete_item") {
        return { id: "receipt-1", item_count: 1, expires_at: "soon" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    const more = await screen.findByRole("button", { name: "More actions" });
    fireEvent.click(more);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pin item" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "More actions" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Unpin item" })).toBeDefined();
    fireEvent.click(screen.getByRole("menuitem", { name: "Favorite item" }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "More actions" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Unfavorite item" })).toBeDefined();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));

    await waitFor(() => expect(calls).toContain("delete_item"));
    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
  });

  it("supports keyboard menu dismissal and pause control", async () => {
    let trackingEnabled: unknown;
    mockTauri((command, args) => {
      if (command === "search_items") return page([baseItem]);
      if (command === "set_clipboard_tracking") {
        trackingEnabled = (args as { enabled: boolean }).enabled;
        return trackingEnabled;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    const more = await screen.findByRole("button", { name: "More actions" });
    fireEvent.click(more);
    const pin = await screen.findByRole("menuitem", { name: "Pin item" });
    await waitFor(() => expect(document.activeElement).toBe(pin));
    fireEvent.keyDown(pin, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);

    fireEvent.click(screen.getByRole("button", { name: "Pause tracking" }));
    expect(await screen.findByText("Tracking paused")).toBeDefined();
    expect(trackingEnabled).toBe(false);
    expect(screen.getByRole("button", { name: "Resume tracking" })).toBeDefined();
  });
});
