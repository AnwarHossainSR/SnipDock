import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { LibraryItem, SaveItemInput } from "../../api/types";
import { mockTauri } from "../../test/setup";
import SnippetEditor from "./SnippetEditor";

const existingItem: LibraryItem = {
  id: "snippet-1",
  kind: "command",
  title: "List files",
  description: "Show tracked files",
  content: "git ls-files",
  notes: "Run from repository root",
  content_type: "shell",
  language: "shell",
  project_id: "project-1",
  category_id: "category-1",
  pinned: false,
  favorite: true,
  private: true,
  tag_ids: ["tag-1", "tag-2"],
  archived_at: null,
  expires_at: "2026-12-01T00:00:00.000Z",
  usage_count: 4,
  last_used_at: null,
  created_at: "2026-07-17T10:00:00.000Z",
  updated_at: "2026-07-17T10:00:00.000Z",
};

function savedItem(input: SaveItemInput): LibraryItem {
  return {
    ...existingItem,
    id: input.id ?? "created-1",
    kind: input.kind,
    title: input.title,
    description: input.description,
    content: input.content,
    notes: input.notes,
    project_id: input.project_id,
    category_id: input.category_id,
    expires_at: input.expires_at,
  };
}

describe("SnippetEditor", () => {
  it("creates a snippet with accessible plain-text fields", async () => {
    let received: SaveItemInput | undefined;
    mockTauri((_command, args) => {
      received = (args as { input: SaveItemInput }).input;
      return savedItem(received);
    });
    let result: LibraryItem | undefined;
    const { container } = render(
      <SnippetEditor onSaved={(item) => (result = item)} onCancel={() => {}} />,
    );

    expect(screen.getByRole("heading", { name: "New snippet" })).toBeDefined();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Fetch users" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "API example" },
    });
    fireEvent.change(screen.getByLabelText("Content"), {
      target: { value: "fetch('/users')" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Requires auth" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save snippet" }));

    await waitFor(() => expect(result?.id).toBe("created-1"));
    expect(received).toEqual({
      id: null,
      kind: "snippet",
      title: "Fetch users",
      description: "API example",
      content: "fetch('/users')",
      notes: "Requires auth",
      project_id: null,
      category_id: null,
      tag_ids: [],
      private: false,
      expires_at: null,
    });
  });

  it("edits an item and preserves metadata outside this form", async () => {
    let received: SaveItemInput | undefined;
    mockTauri((_command, args) => {
      received = (args as { input: SaveItemInput }).input;
      return savedItem(received);
    });
    render(
      <SnippetEditor item={existingItem} onSaved={() => {}} onCancel={() => {}} />,
    );

    expect((screen.getByLabelText("Kind") as HTMLSelectElement).value).toBe("command");
    expect((screen.getByLabelText("Content") as HTMLTextAreaElement).value).toBe(
      "git ls-files",
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "List tracked files" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save command" }));

    await waitFor(() => expect(received?.title).toBe("List tracked files"));
    expect(received).toMatchObject({
      id: "snippet-1",
      project_id: "project-1",
      category_id: "category-1",
      expires_at: "2026-12-01T00:00:00.000Z",
      tag_ids: ["tag-1", "tag-2"],
      private: true,
    });
  });

  it("normalizes an optional whitespace-only command title", async () => {
    let received: SaveItemInput | undefined;
    mockTauri((_command, args) => {
      received = (args as { input: SaveItemInput }).input;
      return savedItem(received);
    });
    render(<SnippetEditor onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "command" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "pwd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save command" }));

    await waitFor(() => expect(received?.title).toBeNull());
  });

  it("validates required and bounded fields before saving", () => {
    let calls = 0;
    mockTauri(() => calls++);
    render(<SnippetEditor onSaved={() => {}} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "d".repeat(1_001) },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "n".repeat(10_001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save snippet" }));

    expect(screen.getByText("Title is required for snippets.")).toBeDefined();
    expect(screen.getByText("Content is required.")).toBeDefined();
    expect(screen.getByText("Description must be 1,000 characters or fewer.")).toBeDefined();
    expect(screen.getByText("Notes must be 10,000 characters or fewer.")).toBeDefined();
    expect(calls).toBe(0);
  });

  it("guards dirty cancel and browser unload", () => {
    let cancelled = 0;
    const originalConfirm = window.confirm;
    let allowDiscard = false;
    window.confirm = () => allowDiscard;
    try {
      render(<SnippetEditor onSaved={() => {}} onCancel={() => cancelled++} />);
      fireEvent.change(screen.getByLabelText("Content"), {
        target: { value: "draft" },
      });

      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(cancelled).toBe(0);
      allowDiscard = true;
      fireEvent.keyDown(screen.getByLabelText("Content"), { key: "Escape" });
      expect(cancelled).toBe(1);
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("saves with Control+S", async () => {
    let calls = 0;
    mockTauri((_command, args) => {
      calls++;
      return savedItem((args as { input: SaveItemInput }).input);
    });
    render(<SnippetEditor onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Quick" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "text" } });

    fireEvent.keyDown(screen.getByLabelText("Content"), {
      key: "s",
      ctrlKey: true,
    });

    await waitFor(() => expect(calls).toBe(1));
  });

  it("ignores a second submit while a save is pending", async () => {
    let calls = 0;
    let finish: ((item: LibraryItem) => void) | undefined;
    mockTauri((_command, args) => {
      calls++;
      const input = (args as { input: SaveItemInput }).input;
      return new Promise<LibraryItem>((resolve) => {
        finish = () => resolve(savedItem(input));
      });
    });
    render(<SnippetEditor onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Quick" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "text" } });
    const saveButton = screen.getByRole("button", { name: "Save snippet" });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(calls).toBe(1);
    finish?.(existingItem);
    await waitFor(() => expect(saveButton.textContent).toBe("Save snippet"));
  });
});
