import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "bun:test";
import type { LibraryItem } from "../../api/types";
import { mockTauri } from "../../test/setup";
import QuickPastePage from "./QuickPastePage";

const item: LibraryItem = {
  id: "item-1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "copied text",
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
  created_at: "2026-07-24T12:00:00.000Z",
  updated_at: "2026-07-24T12:00:00.000Z",
};

test("copies and closes with manual-paste guidance when direct paste is unsupported", async () => {
  const calls: string[] = [];
  mockTauri((command) => {
    calls.push(command);
    if (command === "direct_paste_supported") return false;
    if (command === "search_items") {
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    if (command === "copy_item") {
      return { item_id: item.id, copied_at: item.updated_at, auto_clear_at: null };
    }
    if (command === "plugin:window|hide") return undefined;
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  expect(await screen.findByText("Enter copies, then paste manually")).toBeDefined();
  fireEvent.click(await screen.findByRole("option", { name: /copied text/i }));

  await waitFor(() => expect(calls).toContain("copy_item"));
  expect(calls).toContain("plugin:window|hide");
  expect(calls).not.toContain("direct_paste");
});

test("closes on Escape even when the search input has native handling", async () => {
  const calls: string[] = [];
  mockTauri((command) => {
    calls.push(command);
    if (command === "direct_paste_supported") return false;
    if (command === "search_items") {
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    if (command === "plugin:window|hide") return undefined;
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const input = await screen.findByPlaceholderText("Search clipboard history");
  fireEvent.keyDown(input, { key: "Escape" });

  await waitFor(() => expect(calls).toContain("plugin:window|hide"));
});

test("pastes the numbered row on Ctrl and a digit", async () => {
  const pasted: string[] = [];
  const second = { ...item, id: "item-2", content: "second capture" };
  mockTauri((command, args) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [item, second], total: 2, limit: 50, offset: 0 };
    }
    if (command === "direct_paste") {
      pasted.push((args as { id: string }).id);
      return { item_id: second.id, copied_at: second.updated_at, auto_clear_at: null };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "2", ctrlKey: true });

  // The second row, not whatever the arrow keys had selected.
  await waitFor(() => expect(pasted).toEqual(["item-2"]));
});

test("a bare digit types into the search box instead of pasting", async () => {
  const calls: string[] = [];
  mockTauri((command) => {
    calls.push(command);
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "1" });

  expect(calls).not.toContain("direct_paste");
});

test("numbers the first nine rows so the shortcut is readable", async () => {
  mockTauri((command) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return {
        items: [item, { ...item, id: "item-2", content: "second capture" }],
        total: 2,
        limit: 50,
        offset: 0,
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const options = await screen.findAllByRole("option");
  expect(options[0].textContent).toContain("1");
  expect(options[1].textContent).toContain("2");
});
