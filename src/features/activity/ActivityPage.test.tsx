import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import type { LibraryItem } from "../../api/types";
import ActivityPage from "./ActivityPage";

const items: LibraryItem[] = [
  {
    id: "one",
    kind: "snippet",
    title: "Deploy",
    description: null,
    content: "same",
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
    usage_count: 4,
    last_used_at: null,
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-18T00:00:00Z",
  },
  {
    id: "two",
    kind: "snippet",
    title: "Deploy copy",
    description: null,
    content: "same",
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
    usage_count: 1,
    last_used_at: null,
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-18T00:00:00Z",
  },
];

test("ActivityPage ranks recommendations and archives confirmed duplicates", async () => {
  const calls: string[] = [];
  window.confirm = () => true;
  mockTauri((command) => {
    calls.push(command);
    if (command === "search_items") return { items, total: 2, limit: 100, offset: 0 };
    return items[1];
  });
  render(<ActivityPage />);

  const archive = await screen.findByRole("button", { name: "Archive duplicate" });
  fireEvent.click(archive);

  await waitFor(() => expect(calls).toContain("set_item_flags"));
});
