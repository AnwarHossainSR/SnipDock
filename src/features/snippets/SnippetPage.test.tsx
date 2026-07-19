import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import App from "../../app/App";
import type { LibraryItem, SearchQuery } from "../../api/types";
import { mockTauri } from "../../test/setup";
import SnippetPage from "./SnippetPage";

const snippet: LibraryItem = {
  id: "snippet-1",
  kind: "snippet",
  title: "Deploy API",
  description: "Production release command",
  content: "bun run deploy",
  notes: "Run checks first",
  content_type: "shell",
  language: "shell",
  project_id: null,
  category_id: null,
  pinned: true,
  favorite: false,
  private: false,
  tag_ids: [],
  archived_at: null,
  expires_at: null,
  usage_count: 3,
  last_used_at: "2026-07-17T10:30:00.000Z",
  created_at: "2026-07-16T10:00:00.000Z",
  updated_at: "2026-07-17T10:30:00.000Z",
};

const note: LibraryItem = {
  ...snippet,
  id: "note-2",
  kind: "note",
  title: null,
  description: null,
  content: "Remember the release notes",
  notes: null,
  pinned: false,
  usage_count: 0,
  last_used_at: null,
};

function page(items: LibraryItem[]) {
  return { items, total: items.length, limit: 100, offset: 0 };
}

describe("SnippetPage", () => {
  it("opens the snippet library from the application hash", async () => {
    window.location.hash = "#library";
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));

    render(<App />);

    expect(screen.getByRole("link", { name: "Library" }).getAttribute("aria-current"))
      .toBe("page");
    expect(await screen.findByRole("button", { name: "New snippet" })).toBeDefined();
    window.location.hash = "";
  });

  it("loads reusable items and shows selected details with recent use", async () => {
    let query: SearchQuery | undefined;
    mockTauri((command: string, args?: InvokeArgs) => {
      expect(command).toBe("search_items");
      query = (args as { query: SearchQuery }).query;
      return { items: [snippet], total: 1, limit: 100, offset: 0 };
    });

    const { container } = render(<SnippetPage />);

    expect(await screen.findByRole("heading", { name: "Deploy API" })).toBeDefined();
    expect(query?.kinds).toEqual(["snippet", "command", "template", "note"]);
    expect(screen.getByText("Production release command")).toBeDefined();
    expect(screen.getByText("Used 3 times")).toBeDefined();
    expect(
      container.querySelector('time[datetime="2026-07-17T10:30:00.000Z"]'),
    ).not.toBeNull();
    expect(screen.getByText("bun run deploy")).toBeDefined();
  });

  it("loads another page when more reusable items exist", async () => {
    const offsets: number[] = [];
    mockTauri((command, args) => {
      if (command !== "search_items") return;
      const query = (args as { query: SearchQuery }).query;
      offsets.push(query.offset);
      return query.offset === 0
        ? { ...page([snippet]), total: 2 }
        : { ...page([note]), total: 2, offset: 1 };
    });
    render(<SnippetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("option", { name: /Note/ })).toBeDefined();
    expect(offsets).toEqual([0, 1]);
  });

  it("copies an item and updates its recent-use display", async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "search_items") return page([snippet]);
      if (command === "copy_item") {
        return {
          item_id: snippet.id,
          copied_at: "2026-07-17T11:00:00.000Z",
          auto_clear_at: null,
        };
      }
    });
    render(<SnippetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Copy item" }));

    await waitFor(() => expect(screen.getByText("Used 4 times")).toBeDefined());
    expect(calls).toContainEqual({
      command: "copy_item",
      args: { id: snippet.id, mode: "raw" },
    });
  });

  it("toggles flags and removes an archived item", async () => {
    let current = { ...snippet };
    const flagCalls: unknown[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") return page([current]);
      if (command === "set_item_flags") {
        const flags = (args as { flags: { pinned: boolean | null; favorite: boolean | null; archived: boolean | null } }).flags;
        flagCalls.push(flags);
        current = {
          ...current,
          pinned: flags.pinned ?? current.pinned,
          favorite: flags.favorite ?? current.favorite,
          archived_at: flags.archived ? "2026-07-17T12:00:00.000Z" : current.archived_at,
        };
        return current;
      }
    });
    render(<SnippetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin item" }));
    await waitFor(() => expect(
      (screen.getByRole("button", { name: "More actions" }) as HTMLButtonElement).disabled,
    ).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Pin item" })).toBeDefined();
    fireEvent.click(screen.getByRole("menuitem", { name: "Favorite item" }));
    await waitFor(() => expect(
      (screen.getByRole("button", { name: "More actions" }) as HTMLButtonElement).disabled,
    ).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Unfavorite item" })).toBeDefined();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive item" }));

    expect(await screen.findByText("No library items yet")).toBeDefined();
    expect(flagCalls).toEqual([
      { pinned: false, favorite: null, archived: null },
      { pinned: null, favorite: true, archived: null },
      { pinned: null, favorite: null, archived: true },
    ]);
  });

  it("duplicates and deletes items while preserving selection", async () => {
    const duplicate = {
      ...snippet,
      id: "snippet-copy",
      title: "Copy of Deploy API",
      pinned: false,
      usage_count: 0,
      last_used_at: null,
    };
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      if (command === "search_items") return page([snippet]);
      if (command === "duplicate_item") return duplicate;
      if (command === "delete_item") {
        return {
          id: "receipt-1",
          item_count: 1,
          expires_at: new Date(Date.now() + 50).toISOString(),
        };
      }
    });
    render(<SnippetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate item" }));
    expect(await screen.findByRole("heading", { name: "Copy of Deploy API" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));

    expect(await screen.findByRole("heading", { name: "Deploy API" })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole("option", { name: /Deploy API/ }));
    expect(calls).toContain("duplicate_item");
    expect(calls).toContain("delete_item");
  });

  it("offers undo after deleting an item", async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "search_items") return page([snippet, note]);
      if (command === "delete_item") {
        return {
          id: "receipt-1",
          item_count: 1,
          expires_at: new Date(Date.now() + 30_000).toISOString(),
        };
      }
      if (command === "restore_item") return snippet;
    });
    render(<SnippetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete item" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByRole("heading", { name: "Deploy API" })).toBeDefined();
    expect(calls).toContainEqual({
      command: "restore_item",
      args: { receiptId: "receipt-1" },
    });
  });

  it("creates and edits items in the internal editor", async () => {
    mockTauri((command, args) => {
      if (command === "search_items") return page([snippet]);
      if (command === "save_item") {
        const input = (args as { input: { id: string | null; title: string | null; content: string } }).input;
        return {
          ...snippet,
          id: input.id ?? "snippet-new",
          title: input.title,
          content: input.content,
        };
      }
    });
    render(<SnippetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "New snippet" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New helper" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "helper text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save snippet" }));
    expect(await screen.findByRole("heading", { name: "New helper" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit item" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited helper" } });
    fireEvent.click(screen.getByRole("button", { name: "Save snippet" }));

    expect(await screen.findByRole("heading", { name: "Edited helper" })).toBeDefined();
  });

  it("restores focus after closing the internal editor", async () => {
    mockTauri(() => page([snippet]));
    render(<SnippetPage />);

    const trigger = await screen.findByRole("button", { name: "New snippet" });
    fireEvent.click(trigger);
    const heading = screen.getByRole("heading", { name: "New snippet" });
    expect(heading.id).toBe("workspace-title");
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "New snippet" }),
    ));
  });

  it("moves list selection with arrow keys", async () => {
    mockTauri(() => page([snippet, note]));
    render(<SnippetPage />);

    const first = await screen.findByRole("option", { name: /Deploy API/ });
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: "ArrowDown" });

    expect(screen.getByRole("heading", { name: "Note" })).toBeDefined();
    expect(document.activeElement).toBe(within(screen.getByRole("listbox", { name: "Reusable items" })).getByRole("option", { name: /Note/ }));
  });
});
