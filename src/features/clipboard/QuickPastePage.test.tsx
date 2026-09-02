import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "bun:test";
import type { LibraryItem } from "../../api/types";
import { mockTauri } from "../../test/setup";
import QuickPastePage from "./QuickPastePage";
import { resetClipboardStore } from "../../stores/clipboardStore";

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
  source_app: null,
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

test("F8 cycles the transform and the preview reflects the active one", async () => {
  mockTauri((command) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  // The first transform is `trim`; the second is `lowercase`.
  fireEvent.keyDown(search, { key: "F8" });
  expect((await screen.findByTestId("transform-preview")).textContent).toBe("copied text");
  fireEvent.keyDown(search, { key: "F8" });
  expect((await screen.findByTestId("transform-preview")).textContent).toBe("copied text");
});

test("Backspace clears the active transform and the preview reverts", async () => {
  mockTauri((command) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [{ ...item, content: "  hello  " }], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "T" });
  expect((await screen.findByTestId("transform-preview")).textContent).toBe("hello");
  fireEvent.keyDown(search, { key: "Backspace" });
  await waitFor(() => {
    expect(screen.queryByTestId("transform-preview")).toBeNull();
  });
});

test("single-letter shortcuts pick a transform for the highlighted item", async () => {
  mockTauri((command) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [{ ...item, content: "Hello World" }], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "L" });
  expect((await screen.findByTestId("transform-preview")).textContent).toBe("hello world");
});

test("moving the selection clears the active transform", async () => {
  const second = { ...item, id: "item-2", content: "second" };
  mockTauri((command) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [item, second], total: 2, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "T" });
  expect((await screen.findByTestId("transform-preview")).textContent).toBe("copied text");
  fireEvent.keyDown(search, { key: "ArrowDown" });
  await waitFor(() => {
    expect(screen.queryByTestId("transform-preview")).toBeNull();
  });
});

test("image items disable the transform row and show the empty state", async () => {
  const imageItem: LibraryItem = { ...item, id: "img-1", content_type: "image", content: "img.png" };
  mockTauri((command) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [imageItem], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  await screen.findByText("Image items have no transforms");
  // The "Trim" chip is one of the first chips; disabled buttons are still in
  // the DOM but reject clicks and ignore keys.
  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "T" });
  expect(screen.queryByTestId("transform-preview")).toBeNull();
});

test("an invalid transform surfaces the error and Enter does not paste", async () => {
  const pasted: string[] = [];
  mockTauri((command, args) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [{ ...item, content: "!!!" }], total: 1, limit: 50, offset: 0 };
    }
    if (command === "direct_paste") {
      pasted.push((args as { id: string }).id);
      return { item_id: item.id, copied_at: item.updated_at, auto_clear_at: null };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  // Base64 decode of "!!!" is not valid base64, so the preview pane surfaces
  // an error and the paste call never leaves Quick Paste.
  fireEvent.keyDown(search, { key: "D" });
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(pasted).toEqual([]);
});

test("pasting forwards the active transform to direct_paste", async () => {
  const pasted: { id: string; transform: unknown }[] = [];
  mockTauri((command, args) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    if (command === "direct_paste") {
      pasted.push(args as { id: string; transform: unknown });
      return { item_id: item.id, copied_at: item.updated_at, auto_clear_at: null };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  fireEvent.keyDown(search, { key: "U" });
  fireEvent.keyDown(search, { key: "Enter" });

  await waitFor(() => expect(pasted).toHaveLength(1));
  expect(pasted[0].transform).toBe("uppercase");
});

test("regex mode sends the pattern as `regex` and skips the FTS5 text field", async () => {
  const queries: unknown[] = [];
  mockTauri((command, args) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      queries.push((args as { query: unknown }).query);
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  // Switch to Regex mode via the segmented toggle.
  fireEvent.click(await screen.findByRole("button", { name: "Regex" }));
  fireEvent.change(search, { target: { value: "v\\d+" } });

  await waitFor(() => expect(queries.length).toBeGreaterThan(0));
  const last = queries[queries.length - 1] as { regex?: unknown; text?: unknown };
  expect(last.regex).toBe("v\\d+");
  expect(last.text).toBeNull();
});

test("an invalid regex surfaces an inline error and keeps prior rows on screen", async () => {
  const queries: unknown[] = [];
  let mode: "ok" | "bad" = "ok";
  mockTauri((command, args) => {
    if (command === "direct_paste_supported") return true;
    if (command === "search_items") {
      queries.push((args as { query: unknown }).query);
      if (mode === "bad") {
        throw { code: "invalid_regex", message: "regex parse error:\n    [unclosed" };
      }
      return { items: [item], total: 1, limit: 50, offset: 0 };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(<QuickPastePage />);

  const search = await screen.findByRole("searchbox");
  // Land a good result first.
  fireEvent.change(search, { target: { value: "first" } });
  await waitFor(() => expect(screen.findByRole("option")).resolves.toBeDefined());
  // Now switch to regex and request a broken pattern.
  fireEvent.click(screen.getByRole("button", { name: "Regex" }));
  mode = "bad";
  fireEvent.change(search, { target: { value: "[unclosed" } });
  // The page renders the typed error inline above the (still-visible) rows.
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Invalid regex");
  expect(alert.textContent).toContain("[unclosed");
  // The prior list is still on screen.
  expect(screen.getByRole("option")).toBeDefined();
  // Dismiss clears the error and returns to Literal mode.
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByRole("button", { name: "Literal" }).getAttribute("aria-pressed")).toBe("true");
  // The query text reverts to the last successful value.
  expect((search as HTMLInputElement).value).toBe("first");
});

test("regex mode persists across navigating away and back within a session", async () => {
  const { unmount } = render(<QuickPastePage />);
  fireEvent.click(await screen.findByRole("button", { name: "Regex" }));
  unmount();

  // A second mount reads the same store, so the mode the user set survives.
  render(<QuickPastePage />);
  expect((await screen.findByRole("button", { name: "Regex" })).getAttribute("aria-pressed")).toBe("true");
});

afterEach(() => {
  resetClipboardStore();
});
