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
