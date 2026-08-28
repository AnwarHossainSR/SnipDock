import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it } from "bun:test";
import type { LibraryItem, Page } from "../../api/types";
import { mockTauri } from "../../test/setup";
import ClipboardPage from "./ClipboardPage";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";

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

function page(items: LibraryItem[]): Page<LibraryItem> {
  return { items, total: items.length, limit: 100, offset: 0 };
}

describe("ClipboardPage", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("maps filter chips to backend queries", async () => {
    const queries: unknown[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") queries.push((args as { query: unknown }).query);
      return page([]);
    });
    render(<ClipboardPage />);
    await screen.findByText("Your clipboard is quiet");

    fireEvent.click(screen.getByRole("button", { name: "Code" }));
    await waitFor(() => expect(queries.some((query) => JSON.stringify(query).includes('"code"'))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Pinned" }));
    await waitFor(() => expect(queries.some((query) => JSON.stringify(query).includes('"pinned":true'))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    await waitFor(() => expect(queries.some((query) => JSON.stringify(query).includes('"favorite":true'))).toBe(true));
    expect(screen.queryByRole("button", { name: "Secrets" })).toBeNull();
  });

  it("shows language, private, and flag labels on docked cards", async () => {
    mockTauri(() => page([{ ...baseItem, content_type: "code", language: "Rust", private: true, pinned: true, favorite: true }]));
    render(<ClipboardPage />);
    const row = await screen.findByRole("option");
    expect(within(row).getByText("Rust")).toBeDefined();
    expect(within(row).getByText("Private")).toBeDefined();
    expect(within(row).getByText("Pinned")).toBeDefined();
    expect(within(row).getByText("Favorite")).toBeDefined();
  });

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
    expect(screen.getByText("1–2 of 2 items")).toBeDefined();
    expect(screen.getByText("Tracking active")).toBeDefined();
  });

  it("shows empty and error states", async () => {
    mockTauri(() => page([]));
    const { unmount } = render(<ClipboardPage />);

    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
    unmount();

    mockTauri((command) => {
      if (command === "get_settings") return { clipboard_tracking: true };
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

  it("keeps the list and count current when a clipboard capture arrives", async () => {
    const captured = { ...baseItem, id: "item-2", content: "live capture" };
    mockTauri(() => ({ ...page([baseItem]), total: 1_000 }));
    render(<ClipboardPage />);

    await screen.findByText("1–1 of 1000 items");
    await act(async () => {
      await emit("clipboard://captured", captured);
    });

    expect(await screen.findByText("1–2 of 1001 items")).toBeDefined();
    const rows = await screen.findAllByRole("option");
    expect(rows.map((row) => row.id)).toEqual(["clipboard-item-item-2", "clipboard-item-item-1"]);
  });

  it("saves a manual item and puts the user in front of it", async () => {
    const manual = { ...baseItem, id: "manual", content: "written by hand" };
    const commandsSeen: string[] = [];
    mockTauri((command) => {
      commandsSeen.push(command);
      if (command === "search_items") return page([baseItem]);
      if (command === "save_manual_item") return manual;
      return { clipboard_tracking: true };
    });
    render(<ClipboardPage />);
    await screen.findByRole("option");

    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    fireEvent.change(await screen.findByRole("textbox", { name: /Content/ }), {
      target: { value: "written by hand" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item", hidden: false }));

    await waitFor(() => expect(commandsSeen).toContain("save_manual_item"));
    // It lands in the list like any capture, selected and shown in the rail.
    await waitFor(() =>
      expect(document.getElementById("clipboard-item-manual")?.getAttribute("aria-selected")).toBe("true"),
    );
    const inspector = screen.getByRole("complementary", { name: "Item detail" });
    expect(within(inspector).getByText("written by hand")).toBeDefined();
  });

  it("says so when the active filter hides a manual save", async () => {
    const manual = { ...baseItem, id: "manual", content: "plain text", content_type: "plain_text" as const };
    mockTauri((command, args) => {
      if (command === "search_items") {
        const query = (args as { query: { content_types: string[] } }).query;
        return query.content_types.length > 0 ? page([]) : page([baseItem]);
      }
      if (command === "save_manual_item") return manual;
      return { clipboard_tracking: true };
    });
    render(<ClipboardPage />);
    await screen.findByRole("option");
    fireEvent.click(screen.getByRole("button", { name: "Code" }));
    await screen.findByText("No matching captures");

    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    fireEvent.change(await screen.findByRole("textbox", { name: /Content/ }), {
      target: { value: "plain text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item", hidden: false }));

    expect(await screen.findByText("Item saved. The current filter hides it.")).toBeDefined();
  });

  it("pages through history and reports the range on screen", async () => {
    const pageOf = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...baseItem,
        id: `item-${start + index}`,
        content: `capture ${start + index}`,
      }));
    const offsets: number[] = [];
    mockTauri((command, args) => {
      if (command !== "search_items") return { clipboard_tracking: true };
      const query = (args as { query: { offset: number; limit: number } }).query;
      offsets.push(query.offset);
      // Sized from the requested limit, and short on the last page, exactly as
      // the backend would return it.
      const items = pageOf(query.offset, query.limit).slice(
        0,
        Math.max(0, 265 - query.offset),
      );
      return { items, total: 265, limit: query.limit, offset: query.offset };
    });
    render(<ClipboardPage />);

    await screen.findByText("1–100 of 265 items");
    expect(screen.getAllByRole("option")).toHaveLength(100);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await screen.findByText("101–200 of 265 items");
    expect(offsets).toContain(100);
    // Each page replaces the last rather than appending to it.
    expect(screen.getAllByRole("option")).toHaveLength(100);
    expect(document.getElementById("clipboard-item-item-0")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Last page" }));
    await screen.findByText("201–265 of 265 items");
    expect(offsets).toContain(200);
  });

  it("keeps the rows and focus of the current page when a capture arrives", async () => {
    const pageOf = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...baseItem,
        id: `item-${start + index}`,
        content: `capture ${start + index}`,
      }));
    mockTauri((command, args) => {
      if (command !== "search_items") return { clipboard_tracking: true };
      const query = (args as { query: { offset: number; limit: number } }).query;
      return {
        items: pageOf(query.offset, query.limit),
        total: 265,
        limit: query.limit,
        offset: query.offset,
      };
    });
    render(<ClipboardPage />);

    await screen.findByText("1–100 of 265 items");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("101–200 of 265 items");

    const focused = document.getElementById("clipboard-item-item-145");
    expect(focused).not.toBeNull();
    act(() => focused?.focus());
    expect(document.activeElement).toBe(focused);

    await act(async () => {
      await emit("clipboard://captured", { ...baseItem, id: "live", content: "live capture" });
    });

    // The capture belongs at the top of page one, so page two is left exactly
    // as it was; only the total moves.
    expect(await screen.findByText("101–200 of 266 items")).toBeDefined();
    expect(screen.getAllByRole("option")).toHaveLength(100);
    expect(document.getElementById("clipboard-item-live")).toBeNull();
    expect(document.getElementById("clipboard-item-item-145")).toBe(focused);
    expect(document.activeElement).toBe(focused);
  });

  it("masks a sensitive capture in the list until it is revealed", async () => {
    const secret = { ...baseItem, id: "secret-1", private: true, content: "sk_live_not_a_real_key" };
    mockTauri(() => page([secret]));
    render(<ClipboardPage />);

    const row = await screen.findByRole("option");
    const preview = row.querySelector("pre");
    expect(preview?.className).toContain("blur-[4px]");

    fireEvent.click(within(row).getByRole("button", { name: /Reveal/ }));

    expect(row.querySelector("pre")?.className).not.toContain("blur-[4px]");
  });

  it("reveals the focused sensitive capture with the R key", async () => {
    const secret = { ...baseItem, id: "secret-1", private: true, content: "sk_live_not_a_real_key" };
    mockTauri(() => page([secret]));
    render(<ClipboardPage />);

    const row = await screen.findByRole("option");
    expect(row.querySelector("pre")?.className).toContain("blur-[4px]");

    fireEvent.keyDown(row, { key: "r" });

    expect(row.querySelector("pre")?.className).not.toContain("blur-[4px]");
  });

  it("shows the active item in the inspector and copies from it", async () => {
    const second = { ...baseItem, id: "item-2", content: "second capture" };
    let copyArgs: unknown;
    mockTauri((command, args) => {
      if (command === "search_items") return page([baseItem, second]);
      if (command === "get_settings") return { clipboard_tracking: true, paste_format: "plain_text" };
      if (command === "copy_item") {
        copyArgs = args;
        return { item_id: second.id, copied_at: "2026-07-17T12:00:00.000Z", auto_clear_at: null };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    const inspector = await screen.findByRole("complementary", { name: "Item detail" });
    // Falls back to the first row before anything is selected.
    expect(within(inspector).getByText("first capture")).toBeDefined();
    expect(await within(inspector).findByText("Plain text")).toBeDefined();

    const rows = screen.getAllByRole("option");
    fireEvent.focus(rows[1]);
    expect(within(inspector).getByText("second capture")).toBeDefined();

    fireEvent.click(within(inspector).getByRole("button", { name: "Copy" }));
    await screen.findByText("Copied to clipboard");
    expect(copyArgs).toEqual({ id: second.id, mode: "raw" });
  });

  it("reports the whole set as one range when it fits on a page", async () => {
    mockTauri(() => page([baseItem, { ...baseItem, id: "item-2" }]));
    render(<ClipboardPage />);

    expect(await screen.findByText("1–2 of 2 items")).toBeDefined();
    expect(screen.queryByText(/filtered/)).toBeNull();
  });

  it("counts group headings against the current page only", async () => {
    const pageOf = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...baseItem, id: `item-${start + index}` }));
    mockTauri((command, args) => {
      if (command !== "search_items") return { clipboard_tracking: true };
      const query = (args as { query: { offset: number; limit: number } }).query;
      const items = pageOf(query.offset, query.limit).slice(
        0,
        Math.max(0, 265 - query.offset),
      );
      return { items, total: 265, limit: query.limit, offset: query.offset };
    });
    render(<ClipboardPage />);
    await screen.findByText("1–100 of 265 items");

    fireEvent.click(screen.getByRole("button", { name: "Item kind" }));
    await screen.findByRole("heading", { name: "Clipboard", level: 4 });
    expect(screen.getByText("(100)")).toBeDefined();

    // The short last page shrinks the heading count to match its own rows.
    fireEvent.click(screen.getByRole("button", { name: "Last page" }));

    expect(await screen.findByText("(65)")).toBeDefined();
    expect(screen.getByText("201–265 of 265 items")).toBeDefined();
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

  it("accumulates rows across ctrl-clicks instead of collapsing to one", async () => {
    const second = { ...baseItem, id: "item-2", content: "second capture" };
    mockTauri(() => page([baseItem, second]));
    render(<ClipboardPage />);

    const rows = await screen.findAllByRole("option");
    // Real browsers fire mousedown -> focus -> click in that order; jsdom's
    // fireEvent.click alone skips the focus step, so it's simulated explicitly.
    for (const row of rows) {
      fireEvent.mouseDown(row, { ctrlKey: true });
      fireEvent.focus(row);
      fireEvent.click(row, { ctrlKey: true });
    }

    expect(await screen.findByText("Delete 2 items")).toBeDefined();
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(rows[1].getAttribute("aria-selected")).toBe("true");
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

  it("normalizes the preview for display without touching the copied content", async () => {
    const padded = { ...baseItem, content: "\n\n\n/run-tests\n\n\n" };
    let copyArgs: unknown;
    mockTauri((command, args) => {
      if (command === "search_items") return page([padded]);
      if (command === "copy_item") {
        copyArgs = args;
        return { item_id: padded.id, copied_at: "2026-07-17T12:00:00.000Z", auto_clear_at: null };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    const row = await screen.findByRole("option");
    const preview = row.querySelector("pre");
    expect(preview?.textContent).toBe("/run-tests");

    fireEvent.click(screen.getByRole("button", { name: "Copy item" }));
    await screen.findByText("Copied to clipboard");

    // Copy sends the stored item id, so the backend still copies the original
    // padded content - the display transform cannot reach the clipboard.
    expect(copyArgs).toEqual({ id: padded.id, mode: "raw" });
    expect(useClipboardStore.getState().items[0].content).toBe("\n\n\n/run-tests\n\n\n");
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
    expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();
  });

  it("undoes a deleted item and reloads the accurate history count", async () => {
    let deleted = false;
    mockTauri((command) => {
      if (command === "search_items") return page(deleted ? [] : [baseItem]);
      if (command === "delete_item") {
        deleted = true;
        return {
          id: "receipt-1",
          item_count: 1,
          expires_at: "2099-01-01T00:00:00.000Z",
        };
      }
      if (command === "restore_item") {
        deleted = false;
        return baseItem;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("1–1 of 1 item")).toBeDefined();
    expect((await screen.findByRole("option")).textContent).toContain("first capture");
  });

  it("deletes consecutive items without waiting for undo to expire", async () => {
    const second = { ...baseItem, id: "item-2", content: "second capture" };
    let deletes = 0;
    mockTauri((command) => {
      if (command === "search_items") return page([baseItem, second]);
      if (command === "delete_item") {
        deletes += 1;
        return { id: `receipt-${deletes}`, item_count: 1, expires_at: "2099-01-01T00:00:00.000Z" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: "More actions" }))[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));
    await screen.findByRole("button", { name: "Undo" });

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));

    await waitFor(() => expect(deletes).toBe(2));
    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
  });

  it("blocks another destructive action while a receipt is pending", async () => {
    const second = { ...baseItem, id: "item-2", content: "second capture" };
    let finishDelete: ((receipt: object) => void) | undefined;
    mockTauri((command) => {
      if (command === "search_items") return page([baseItem, second]);
      if (command === "delete_item") {
        return new Promise((resolve) => {
          finishDelete = resolve;
        });
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: "More actions" }))[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));

    expect(
      (screen.getByRole("button", { name: "Clear history" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "More actions" })[1]);
    expect(
      (screen.getByRole("menuitem", { name: "Delete item" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await act(async () => {
      finishDelete?.({ id: "receipt-1", item_count: 1, expires_at: "soon" });
    });
  });

  it("contains confirmation focus and restores it on Escape", async () => {
    mockTauri(() => page([baseItem]));
    render(<ClipboardPage />);

    const trigger = await screen.findByRole("button", { name: "Clear history" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    const firstScopeRadio = within(dialog).getByRole("radio", { name: /Everything/ });
    const confirm = within(dialog).getByRole("button", { name: "Clear history" });
    act(() => confirm.focus());
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement === firstScopeRadio).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement === trigger).toBe(true);
  });

  it("warns that clear history removes every item when a filter is active", async () => {
    mockTauri((command, args) => {
      if (command === "search_items") {
        const query = (args as { query: { pinned: boolean | null } }).query;
        return query.pinned ? page([{ ...baseItem, pinned: true }]) : { ...page([baseItem]), total: 200 };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pinned" }));
    await screen.findByText("1–1 of 1 item");
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));

    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    expect(within(dialog).getByText("All clipboard history except pinned and favorite items will be removed, and can be restored for 30 seconds.")).toBeDefined();
  });

  it("clears only images when the image scope is chosen", async () => {
    let received: unknown;
    let cleared = false;
    mockTauri((command, args) => {
      if (command === "search_items") return page(cleared ? [] : [baseItem]);
      if (command === "clear_clipboard_history_with_options") {
        received = args;
        cleared = true;
        return { id: "clear-receipt", item_count: 1, expires_at: "2099-01-01T00:00:00.000Z" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Images only/ }));

    // The confirmation renames itself so the scope is unmistakable before the
    // destructive click.
    const scoped = screen.getByRole("dialog", { name: "Clear image history?" });
    expect(
      within(scoped).getByText(
        "Every image in the clipboard history except pinned and favorite items will be removed, and can be restored for 30 seconds.",
      ),
    ).toBeDefined();

    fireEvent.click(within(scoped).getByRole("button", { name: "Clear images" }));

    expect(await screen.findByText("1 item removed")).toBeDefined();
    expect(received).toEqual({
      excludePinned: true,
      excludeFavorite: true,
      contentTypes: ["image"],
      olderThanDays: null,
    });
  });

  it("retries a failed first load in place instead of asking for a restart", async () => {
    let attempt = 0;
    mockTauri((command) => {
      if (command === "get_settings") {
        // The state is not managed yet on the first launch attempt, which is
        // what both of these failures look like from here.
        if (attempt === 0) throw new Error("state not managed");
        return { clipboard_tracking: true, paste_format: "preserve", clipboard_page_size: 100 };
      }
      if (command === "search_items") {
        if (attempt === 0) {
          attempt += 1;
          throw new Error("state not managed");
        }
        return page([baseItem]);
      }
      return undefined;
    });
    render(<ClipboardPage />);

    expect(await screen.findByText("Clipboard history unavailable")).toBeDefined();
    expect(screen.getByText("Could not read clipboard tracking status.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect((await screen.findAllByText("first capture")).length).toBeGreaterThan(0);
    // The banner goes with the failure that raised it.
    expect(screen.queryByText("Could not read clipboard tracking status.")).toBeNull();
    expect(screen.queryByText("Clipboard history unavailable")).toBeNull();
  });

  it("reloads from the header refresh and clears the error banner", async () => {
    let attempt = 0;
    mockTauri((command) => {
      if (command === "get_settings") {
        if (attempt === 0) throw new Error("state not managed");
        return { clipboard_tracking: true, paste_format: "preserve", clipboard_page_size: 100 };
      }
      if (command === "search_items") {
        if (attempt === 0) {
          attempt += 1;
          throw new Error("state not managed");
        }
        return page([baseItem]);
      }
      return undefined;
    });
    render(<ClipboardPage />);

    expect(await screen.findByText("Could not read clipboard tracking status.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect((await screen.findAllByText("first capture")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Could not read clipboard tracking status.")).toBeNull();
  });

  it("keeps the showing filter as a saved search from the header", async () => {
    let saved: unknown;
    mockTauri((command, args) => {
      if (command === "search_items") return page([baseItem]);
      if (command === "save_smart_folder") {
        saved = args;
        return {
          id: "folder-1",
          name: "Screenshots",
          description: null,
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
            sort: "newest",
            limit: 100,
            offset: 0,
          },
          icon: "",
          color: "",
          position: 0,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    // Nothing shadows the filter row until the naming form is asked for.
    expect(screen.queryByLabelText("Name this view")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Save this view" }));
    fireEvent.change(screen.getByLabelText("Name this view"), {
      target: { value: "Screenshots" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).toBeDefined());
    expect((saved as { input: { name: string } }).input.name).toBe("Screenshots");
  });

  it("clears only what is older than the chosen age", async () => {
    let received: unknown;
    let cleared = false;
    mockTauri((command, args) => {
      if (command === "search_items") return page(cleared ? [] : [baseItem]);
      if (command === "clear_clipboard_history_with_options") {
        received = args;
        cleared = true;
        return { id: "clear-receipt", item_count: 1, expires_at: "2099-01-01T00:00:00.000Z" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Images only/ }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "30 days" }));

    expect(
      within(dialog).getByText(
        "Every image in the clipboard history older than 30 days except pinned and favorite items will be removed, and can be restored for 30 seconds.",
      ),
    ).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Clear images" }));

    expect(await screen.findByText("1 item removed")).toBeDefined();
    expect(received).toEqual({
      excludePinned: true,
      excludeFavorite: true,
      contentTypes: ["image"],
      olderThanDays: 30,
    });
  });

  it("says which age found nothing when a dated sweep is empty", async () => {
    mockTauri((command) => {
      if (command === "search_items") return page([baseItem]);
      if (command === "clear_clipboard_history_with_options") {
        throw { code: "not_found", message: "item not found" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "90 days" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear history" }));

    expect(
      await screen.findByText(
        "Nothing to clear — no captures are older than 90 days, or the ones that are are pinned or favorite.",
      ),
    ).toBeDefined();
  });

  it("keeps focus inside confirmation while clear is pending", async () => {
    let finishClear: ((receipt: object) => void) | undefined;
    let cleared = false;
    mockTauri((command) => {
      if (command === "search_items") return page(cleared ? [] : [baseItem]);
      if (command === "clear_clipboard_history_with_options") {
        return new Promise((resolve) => {
          finishClear = resolve;
        });
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear history" }));
    await screen.findByRole("button", { name: "Clearing…" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement === dialog).toBe(true);

    cleared = true;
    await act(async () => {
      finishClear?.({ id: "receipt-1", item_count: 1, expires_at: "soon" });
    });
  });

  it("confirms clear history, reports backend count, and restores the bulk receipt", async () => {
    const second = { ...baseItem, id: "item-2", content: "second capture" };
    let cleared = false;
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      if (command === "search_items") return page(cleared ? [] : [baseItem, second]);
      if (command === "clear_clipboard_history_with_options") {
        cleared = true;
        return {
          id: "clear-receipt",
          item_count: 2,
          expires_at: "2099-01-01T00:00:00.000Z",
        };
      }
      if (command === "restore_item") {
        cleared = false;
        return second;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear history" }));

    expect(await screen.findByText("2 items removed")).toBeDefined();
    expect((document.activeElement as HTMLElement | null)?.id).toBe("workspace-title");
    // With nothing left there is no list and no pager, only the empty state.
    expect(screen.getByText("Your clipboard is quiet")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("1–2 of 2 items")).toBeDefined();
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(calls).toContain("clear_clipboard_history_with_options");
    expect(calls).toContain("restore_item");
  });

  it("shows a friendly message when nothing is eligible to clear", async () => {
    mockTauri((command) => {
      if (command === "search_items") return page([baseItem]);
      if (command === "clear_clipboard_history_with_options") {
        throw { code: "not_found", message: "item not found" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<ClipboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear clipboard history?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear history" }));

    expect(
      await screen.findByText("Nothing to clear — the remaining items are pinned or favorite."),
    ).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Resume tracking" }));
    expect(await screen.findByText("Tracking active")).toBeDefined();
    expect(trackingEnabled).toBe(true);
    expect(screen.getByRole("button", { name: "Pause tracking" })).toBeDefined();
  });

  it("reveals and selects the item a pinned sidebar entry asks for", async () => {
    const second = { ...baseItem, id: "item-2", content: "second capture", pinned: true };
    mockTauri(() => page([baseItem, second]));
    render(<ClipboardPage />);
    await screen.findAllByRole("option");

    act(() => useClipboardStore.getState().requestFocusItem("item-2"));

    const rows = await screen.findAllByRole("option");
    await waitFor(() => expect(rows[1].getAttribute("aria-selected")).toBe("true"));
    expect(rows[0].getAttribute("aria-selected")).toBe("false");
    // The request is consumed, so a later render cannot re-steal the selection.
    expect(useClipboardStore.getState().focusRequest).toBeNull();
  });

  it("falls back to the Pinned filter for an item that is not loaded", async () => {
    const queries: { pinned: boolean | null }[] = [];
    mockTauri((command, args) => {
      if (command !== "search_items") return { clipboard_tracking: true };
      const query = (args as { query: { pinned: boolean | null } }).query;
      queries.push(query);
      return query.pinned ? page([{ ...baseItem, id: "older", pinned: true }]) : page([baseItem]);
    });
    render(<ClipboardPage />);
    await screen.findAllByRole("option");

    act(() => useClipboardStore.getState().requestFocusItem("older"));

    await waitFor(() => expect(queries.some((query) => query.pinned === true)).toBe(true));
    const row = await screen.findByRole("option");
    expect(row.id).toBe("clipboard-item-older");
    await waitFor(() => expect(row.getAttribute("aria-selected")).toBe("true"));
    expect(useClipboardStore.getState().focusRequest).toBeNull();
  });
});
