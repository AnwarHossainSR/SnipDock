import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { LibraryItem } from "../../api/types";
import ItemInspector from "./ItemInspector";

const item: LibraryItem = {
  id: "item-1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "select 1;\nselect 2;",
  notes: null,
  content_type: "sql",
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
  source_app: null,
  created_at: "2026-07-17T10:00:00.000Z",
  updated_at: "2026-07-17T10:00:00.000Z",
};

const noop = () => {};

function renderInspector(overrides: Partial<Parameters<typeof ItemInspector>[0]> = {}) {
  return render(
    <ItemInspector
      item={item}
      busy={false}
      revealed={false}
      pasteFormat="preserve"
      onReveal={noop}
      onCopy={noop}
      onTogglePin={noop}
      onToggleFavorite={noop}
      onDelete={noop}
      {...overrides}
    />,
  );
}

describe("ItemInspector", () => {
  it("prompts for a selection when nothing is active", () => {
    renderInspector({ item: null });
    expect(screen.getByText("Select a capture to see all of it here.")).toBeDefined();
  });

  it("shows the item's content in the Preview tab and the active paste format", () => {
    const { container } = renderInspector();

    expect(screen.getByRole("heading", { name: "SQL capture" })).toBeDefined();
    expect(container.querySelector("pre")?.textContent).toBe("select 1;\nselect 2;");
    expect(screen.getByText("Preserve original")).toBeDefined();
  });

  it("shows character/line stats and usage count in the Details tab", () => {
    renderInspector();

    fireEvent.click(screen.getByRole("tab", { name: "Details" }));

    expect(screen.getByText("19")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("4×")).toBeDefined();
  });

  it("shows a placeholder state in the Transform tab", () => {
    renderInspector();

    fireEvent.click(screen.getByRole("tab", { name: "Transform" }));

    expect(screen.getByText("No transforms available yet.")).toBeDefined();
  });

  it("hides a sensitive capture until it is revealed", () => {
    const secret = { ...item, private: true, content: "sk_live_not_a_real_key" };
    const { rerender } = renderInspector({ item: secret });

    expect(document.querySelector("pre")).toBeNull();
    expect(screen.getByText("Hidden because this looks like a credential.")).toBeDefined();
    expect(screen.getByText("Sensitive")).toBeDefined();

    rerender(
      <ItemInspector
        item={secret}
        busy={false}
        revealed
        pasteFormat="preserve"
        onReveal={noop}
        onCopy={noop}
        onTogglePin={noop}
        onToggleFavorite={noop}
        onDelete={noop}
      />,
    );

    expect(document.querySelector("pre")?.textContent).toBe("sk_live_not_a_real_key");
    expect(screen.getByText("Revealed")).toBeDefined();
  });

  it("reveals on request", () => {
    let revealed = 0;
    renderInspector({ item: { ...item, private: true }, onReveal: () => { revealed += 1; } });

    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(revealed).toBe(1);
  });

  it("runs copy, pin, and favorite from the pane", () => {
    const calls: string[] = [];
    renderInspector({
      onCopy: () => calls.push("copy"),
      onTogglePin: () => calls.push("pin"),
      onToggleFavorite: () => calls.push("favorite"),
      onDelete: () => calls.push("delete"),
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Star" }));

    expect(calls).toEqual(["copy", "pin", "favorite"]);
  });

  it("labels the actions for an item that is already pinned and starred", () => {
    renderInspector({ item: { ...item, pinned: true, favorite: true } });

    expect(screen.getByRole("button", { name: "Unpin" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Unstar" })).toBeDefined();
    expect(screen.getByText("Pinned")).toBeDefined();
    expect(screen.getByText("Favorite")).toBeDefined();
  });

  it("omits the paste-format note when settings are unavailable", () => {
    renderInspector({ pasteFormat: null });
    expect(screen.queryByText(/Pasting as/)).toBeNull();
  });
});
