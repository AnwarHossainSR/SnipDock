import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockTauri } from "../../test/setup";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import SavedSearchBar from "./SavedSearchBar";

const folder = {
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

describe("SavedSearchBar", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  test("saves the filter that is showing under the name the user types", async () => {
    let saved: InvokeArgs | undefined;
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "save_smart_folder") {
        saved = args;
        return folder;
      }
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
      return undefined;
    });
    useClipboardStore.setState({ filter: "image" });
    render(<SavedSearchBar naming onNamingChange={() => {}} />);

    fireEvent.change(screen.getByLabelText("Name this view"), {
      target: { value: "Screenshots" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).toBeDefined());
    const input = (saved as { input: { name: string; query: { content_types: string[] } } }).input;
    expect(input.name).toBe("Screenshots");
    // The image filter is what was showing, so that is what gets kept.
    expect(input.query.content_types).toEqual(["image"]);
  });

  test("opens the folder it just saved", async () => {
    mockTauri((command) => {
      if (command === "save_smart_folder") return folder;
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
      return undefined;
    });
    render(<SavedSearchBar naming onNamingChange={() => {}} />);

    fireEvent.change(screen.getByLabelText("Name this view"), { target: { value: "Screenshots" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Screenshots")).toBeDefined();
    await waitFor(() => expect(useClipboardStore.getState().savedSearch?.id).toBe("folder-1"));
  });

  test("closing an open folder goes back to the whole history", async () => {
    mockTauri((command) =>
      command === "search_items" ? { items: [], total: 0, limit: 100, offset: 0 } : undefined,
    );
    useClipboardStore.setState({
      savedSearch: { id: folder.id, name: folder.name, query: folder.query as never, source: "folder" },
    });
    render(<SavedSearchBar naming={false} onNamingChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(useClipboardStore.getState().savedSearch).toBeNull());
    expect(useClipboardStore.getState().filter).toBe("all");
  });

  test("deleting an open folder closes it too", async () => {
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
      return undefined;
    });
    useClipboardStore.setState({
      savedSearch: { id: folder.id, name: folder.name, query: folder.query as never, source: "folder" },
    });
    render(<SavedSearchBar naming={false} onNamingChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(calls).toContain("delete_smart_folder"));
    await waitFor(() => expect(useClipboardStore.getState().savedSearch).toBeNull());
  });

  test("keeps the folder open when the delete fails", async () => {
    mockTauri((command) => {
      if (command === "delete_smart_folder") throw new Error("database is locked");
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
      return undefined;
    });
    useClipboardStore.setState({
      savedSearch: { id: folder.id, name: folder.name, query: folder.query as never, source: "folder" },
    });
    render(<SavedSearchBar naming={false} onNamingChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(useClipboardStore.getState().savedSearch?.id).toBe("folder-1");
  });
});
