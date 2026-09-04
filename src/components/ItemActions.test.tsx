import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { LibraryItem } from "../api/types";
import ItemActions from "./ItemActions";

const item: LibraryItem = {
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
  source_app: null,
};

function renderActions() {
  return render(
    <div>
      <button type="button">Outside</button>
      <ItemActions
        item={item}
        busy={false}
        onCopy={() => {}}
        onTogglePin={() => {}}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
      />
    </div>,
  );
}

describe("ItemActions", () => {
  it("closes the menu when a press lands outside it", () => {
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeDefined();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the menu open for a press inside it", () => {
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Pin item" }));

    expect(screen.getByRole("menu")).toBeDefined();
  });

  it("closes the menu on Escape", () => {
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
