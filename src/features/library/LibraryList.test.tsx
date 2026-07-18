import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { act } from "react";
import type { LibraryItem, Page, SearchQuery } from "../../lib/types";
import { mockTauri } from "../../test/setup";
import LibraryList from "./LibraryList";

function libraryItem(overrides: Partial<LibraryItem> & { id: string }): LibraryItem {
  return {
    kind: "snippet",
    title: overrides.id,
    description: null,
    content: "content",
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function emptyPage(): Page<LibraryItem> {
  return { items: [], total: 0, limit: 20, offset: 0 };
}

function mockTaxonomy(search: (query: SearchQuery) => Page<LibraryItem> | Promise<Page<LibraryItem>>) {
  mockTauri((command, args) => {
    if (command === "list_projects") return [];
    if (command === "list_categories") return [];
    if (command === "list_tags") return [];
    if (command === "search_items") {
      return search((args as { query: SearchQuery }).query);
    }
  });
}

describe("LibraryList", () => {
  it("debounces search input and only queries once for rapid typing", async () => {
    const texts: (string | null)[] = [];
    mockTaxonomy((query) => {
      texts.push(query.text);
      return emptyPage();
    });

    render(<LibraryList />);
    const input = await screen.findByLabelText("Search library");

    fireEvent.change(input, { target: { value: "r" } });
    fireEvent.change(input, { target: { value: "ru" } });
    fireEvent.change(input, { target: { value: "rust" } });

    await waitFor(() => expect(texts).toContain("rust"));
    await screen.findByText("No results");
    expect(texts).not.toContain("r");
    expect(texts).not.toContain("ru");

    // Initial mount query (null) plus the one debounced query for "rust".
    expect(texts).toEqual([null, "rust"]);
  });

  it("suppresses a stale response that resolves after a newer request", async () => {
    const pending: Array<{ kind: string; resolve: (value: Page<LibraryItem>) => void }> = [];
    mockTaxonomy((query) => {
      if (query.kinds.length === 0) return emptyPage();
      return new Promise((resolve) => {
        pending.push({ kind: query.kinds[0], resolve });
      });
    });

    render(<LibraryList />);
    await screen.findByLabelText("Kind");

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "snippet" } });
    await waitFor(() => expect(pending.length).toBe(1));
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "note" } });
    await waitFor(() => expect(pending.length).toBe(2));

    // Resolve the newer ("note") request first, then the stale ("snippet") one.
    pending[1].resolve({
      items: [libraryItem({ id: "note-item", kind: "note", title: "Note item" })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    await screen.findByText(/Note item/);

    pending[0].resolve({
      items: [libraryItem({ id: "snippet-item", kind: "snippet", title: "Snippet item" })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    await waitFor(() => expect(screen.queryByText(/Snippet item/)).toBeNull());

    expect(screen.getByText(/Note item/)).toBeDefined();
  });

  it("shows an active-filter chip and clears it on removal", async () => {
    const kinds: string[][] = [];
    mockTaxonomy((query) => {
      kinds.push(query.kinds);
      return emptyPage();
    });

    render(<LibraryList />);
    await screen.findByLabelText("Kind");

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "snippet" } });
    const chip = await screen.findByRole("button", { name: /Kind: Snippet/ });

    fireEvent.click(chip);
    await waitFor(() => expect(kinds.at(-1)).toEqual([]));
    expect(screen.queryByRole("button", { name: /Kind: Snippet/ })).toBeNull();
  });

  it("pages through results with previous and next controls", async () => {
    const offsets: number[] = [];
    mockTaxonomy((query) => {
      offsets.push(query.offset);
      const items = [libraryItem({ id: `item-${query.offset}`, title: `Item ${query.offset}` })];
      return { items, total: 40, limit: 20, offset: query.offset };
    });

    render(<LibraryList />);
    await screen.findByText("1-20 of 40");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("21-40 of 40");
    expect(offsets).toContain(20);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("1-20 of 40");
    expect(offsets.filter((offset) => offset === 0).length).toBe(2);
  });

  it("supports arrow-key navigation between results", async () => {
    mockTaxonomy(() => ({
      items: [
        libraryItem({ id: "first", title: "First" }),
        libraryItem({ id: "second", title: "Second" }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    }));

    render(<LibraryList />);
    await screen.findByLabelText("Kind");
    const first = await screen.findByText("First");
    const firstOption = first.closest('[role="option"]') as HTMLElement;
    act(() => {
      firstOption.focus();
    });

    fireEvent.keyDown(firstOption, { key: "ArrowDown" });

    await waitFor(() => expect(document.activeElement?.id).toBe("library-item-second"));
  });

  it("focuses the search input when pressing / outside of a form control", async () => {
    mockTaxonomy(() => emptyPage());

    render(<LibraryList />);
    const input = await screen.findByLabelText("Search library");
    document.body.focus();

    fireEvent.keyDown(document, { key: "/" });

    expect(document.activeElement).toBe(input);
  });
});
