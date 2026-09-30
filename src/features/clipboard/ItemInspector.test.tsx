import { fireEvent, render, screen, within } from "@testing-library/react";
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
      onClose={noop}
      {...overrides}
    />,
  );
}

describe("ItemInspector", () => {
  it("prompts for a selection when nothing is active", () => {
    renderInspector({ item: null });
    expect(screen.getByText("Select a capture to see all of it here.")).toBeDefined();
  });

  it("shows the item's content and the active paste format", () => {
    const { container } = renderInspector();

    expect(screen.getByRole("heading", { name: "SQL capture" })).toBeDefined();
    expect(container.querySelector("pre")?.textContent).toBe("select 1;\nselect 2;");
    expect(screen.getByText("Preserve original")).toBeDefined();
  });

  // One column, no tabs: the facts sit under the preview.
  it("shows character/line stats and usage count with the preview", () => {
    const { container } = renderInspector();

    expect(screen.queryByRole("tab")).toBeNull();
    // Scoped to the facts: the preview's line numbers are digits too.
    const facts = within(container.querySelector("dl") as HTMLElement);
    expect(facts.getByText("19")).toBeDefined();
    expect(facts.getByText("2")).toBeDefined();
    expect(facts.getByText("4×")).toBeDefined();
  });

  // A transform is a choice of what to copy, so it changes the preview in
  // place - the preview is what Copy will hand back.
  it("previews a transform and copies through it", () => {
    const copies: unknown[] = [];
    const { container } = renderInspector({ onCopy: (transform) => copies.push(transform) });

    expect(screen.getByRole("button", { name: "As is" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Upper" }));

    expect(screen.getByRole("button", { name: "Upper" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "As is" }).getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("pre")?.textContent).toBe("SELECT 1;\nSELECT 2;");
    fireEvent.click(screen.getByRole("button", { name: /^Copy/ }));
    expect(copies).toEqual(["uppercase"]);

    fireEvent.click(screen.getByRole("button", { name: "As is" }));
    expect(container.querySelector("pre")?.textContent).toBe("select 1;\nselect 2;");
  });

  it("copies the capture as it is when a transform does not apply", () => {
    const copies: unknown[] = [];
    renderInspector({ onCopy: (transform) => copies.push(transform) });

    fireEvent.click(screen.getByRole("button", { name: "JSON pretty" }));

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /^Copy/ }));
    expect(copies).toEqual([null]);
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
        onClose={noop}
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
      onClose: () => calls.push("close"),
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Star" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete capture" }));
    fireEvent.click(screen.getByRole("button", { name: "Close item detail" }));

    expect(calls).toEqual(["copy", "pin", "favorite", "delete", "close"]);
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
