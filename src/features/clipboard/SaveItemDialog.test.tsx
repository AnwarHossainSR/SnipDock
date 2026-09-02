import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import type { LibraryItem } from "../../api/types";
import { mockTauri } from "../../test/setup";
import SaveItemDialog from "./SaveItemDialog";

const saved: LibraryItem = {
  id: "item-1",
  kind: "clipboard",
  title: "Deploy",
  description: null,
  content: "bun run deploy",
  notes: null,
  content_type: "shell",
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
  source_app: null,
  created_at: "2026-08-27T10:00:00.000Z",
  updated_at: "2026-08-27T10:00:00.000Z",
};

function open(onSaved: (item: LibraryItem) => void = () => {}) {
  return render(<SaveItemDialog open onOpenChange={() => {}} onSaved={onSaved} />);
}

describe("SaveItemDialog", () => {
  it("sends the trimmed title and untouched content, then hands back the item", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args) => {
      if (command !== "save_manual_item") throw new Error(`Unexpected command: ${command}`);
      received = args;
      return saved;
    });
    const handed: LibraryItem[] = [];
    open((item) => handed.push(item));

    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "  Deploy  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Content/ }), {
      target: { value: "  bun run deploy\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(handed).toEqual([saved]));
    // Surrounding whitespace is the user's, and copying must return it.
    expect(received).toEqual({ content: "  bun run deploy\n", title: "Deploy" });
  });

  it("omits an empty title rather than saving a blank one", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((_command, args) => {
      received = args;
      return saved;
    });
    open();

    fireEvent.change(screen.getByRole("textbox", { name: /Content/ }), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(received).toEqual({ content: "hello", title: null }));
  });

  it("refuses to save until there is content", () => {
    mockTauri(() => saved);
    open();

    const save = screen.getByRole("button", { name: "Save item" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: /Content/ }), {
      target: { value: "   " },
    });
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: /Content/ }), {
      target: { value: "x" },
    });
    expect(save.disabled).toBe(false);
  });

  it("fills the content from the system clipboard", async () => {
    mockTauri((command) => {
      if (command === "read_clipboard_text") return "pasted from the clipboard";
      throw new Error(`Unexpected command: ${command}`);
    });
    open();

    fireEvent.click(screen.getByRole("button", { name: "Paste from clipboard" }));

    const content = (await screen.findByRole("textbox", { name: /Content/ })) as HTMLTextAreaElement;
    await waitFor(() => expect(content.value).toBe("pasted from the clipboard"));
  });

  it("reports a rejected save instead of closing", async () => {
    mockTauri((command) => {
      if (command !== "save_manual_item") throw new Error(`Unexpected command: ${command}`);
      throw { code: "validation", message: "content must not exceed 1,000,000 bytes" };
    });
    const handed: LibraryItem[] = [];
    open((item) => handed.push(item));

    fireEvent.change(screen.getByRole("textbox", { name: /Content/ }), {
      target: { value: "too much" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "content must not exceed 1,000,000 bytes",
    );
    expect(handed).toEqual([]);
  });
});
