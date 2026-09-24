import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { LibraryItem } from "../../api/types";
import { mockTauri } from "../../test/setup";
import { useClipboardStore } from "../../stores/clipboardStore";
import CommandPalette from "./CommandPalette";

const capture = (id: string, overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  kind: "clipboard",
  title: null,
  description: null,
  content: `content of ${id}`,
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
  source_app: "Code.exe",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const recent = [
  capture("json", { content: '{ "id": "ord_8f3k2m" }', content_type: "json" }),
  capture("secret", { content: "sk_live_do_not_show", private: true }),
];

let calls: { command: string; args: unknown }[] = [];

function mockBackend(extra: (command: string, args: unknown) => unknown = () => undefined) {
  calls = [];
  mockTauri((command, args) => {
    calls.push({ command, args });
    if (command === "search_items") return { items: recent, total: recent.length, limit: 3, offset: 0 };
    if (command === "get_source_app_counts") return [{ source_app: null, count: 40 }, { source_app: "Code.exe", count: 12 }];
    return extra(command, args);
  });
}

/** Renders the palette and waits for its recent captures and top source,
 *  which load on open, so no test acts on a half-loaded list. */
async function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    open: true,
    onClose: mock(() => {}),
    trackingPaused: false,
    onTrackingChanged: mock((_paused: boolean) => {}),
    onShowClipboard: mock(() => {}),
    onSearch: mock((_text: string) => {}),
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  await screen.findByRole("option", { name: /Source · Code\.exe/ });
  return props;
}

const field = () => screen.getByRole("combobox", { name: "Command or search" });
const selectedOption = () => screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true");

describe("CommandPalette", () => {
  beforeEach(() => {
    window.location.hash = "#clipboard";
    mockBackend();
  });

  it("opens as a labelled dialog with the field focused and the first command selected", async () => {
    await renderPalette();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeDefined();
    expect(document.activeElement === field()).toBe(true);
    expect(selectedOption()?.textContent).toContain("Pause capture");
    expect(field().getAttribute("aria-activedescendant")).toBe(selectedOption()?.id ?? "");
    await screen.findByText('{ "id": "ord_8f3k2m" }');
    // The most frequent named source, not the unnamed bucket above it.
    expect(screen.getByRole("option", { name: /Source · Code\.exe/ }).textContent).toContain("12 captures");
  });

  // The palette is one more place a sensitive capture could be read.
  it("names a private capture without showing or matching its text", async () => {
    await renderPalette();
    await screen.findByText("Private capture");
    expect(document.body.textContent).not.toContain("sk_live_do_not_show");
    fireEvent.change(field(), { target: { value: "sk_live" } });
    expect(screen.queryByText("Private capture")).toBeNull();
  });

  it("filters on every typed word and moves the selection with the arrow keys", async () => {
    await renderPalette();
    await screen.findByText("Private capture");
    fireEvent.change(field(), { target: { value: "privacy sweep" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("Settings › Privacy"),
    ]);

    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(selectedOption()?.textContent).toContain("Save an item");
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    // Wraps from the first command to the last.
    expect(selectedOption()?.textContent).toContain("Settings › Privacy");
  });

  it("selects the first command whose name matches, not one matched on a keyword", async () => {
    await renderPalette();
    fireEvent.change(field(), { target: { value: "cl" } });
    // Pause capture is listed (its keywords say "clipboard") but not chosen.
    expect(screen.getByRole("option", { name: /Pause capture/ })).toBeDefined();
    expect(selectedOption()?.textContent).toContain("Clear history");
  });

  it("pauses capture through the same command as the capture pill", async () => {
    mockBackend((command) => (command === "set_clipboard_tracking" ? false : undefined));
    const props = await renderPalette();
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(props.onClose).toHaveBeenCalled();
    await waitFor(() => expect(props.onTrackingChanged).toHaveBeenCalledWith(true));
    expect(calls.find((call) => call.command === "set_clipboard_tracking")?.args).toEqual({ enabled: false });
    expect((await screen.findByRole("status")).textContent).toContain("Capture paused");
  });

  it("copies a recent capture and says so", async () => {
    await renderPalette();
    fireEvent.click(await screen.findByRole("option", { name: /ord_8f3k2m/ }));
    await waitFor(() => expect(calls.some((call) => call.command === "copy_item")).toBe(true));
    expect(calls.find((call) => call.command === "copy_item")?.args).toMatchObject({ id: "json" });
    expect((await screen.findByRole("status")).textContent).toContain("Copied to clipboard");
  });

  it("asks the Clipboard page for its dialogs rather than drawing its own", async () => {
    const props = await renderPalette();
    fireEvent.click(screen.getByRole("option", { name: /Clear history/ }));
    expect(useClipboardStore.getState().pageRequest).toBe("clear");
    expect(props.onShowClipboard).toHaveBeenCalled();
  });

  it("narrows the history to pinned captures", async () => {
    const props = await renderPalette();
    fireEvent.click(screen.getByRole("option", { name: /Pinned captures/ }));
    expect(useClipboardStore.getState().filter).toBe("pinned");
    expect(props.onShowClipboard).toHaveBeenCalled();
  });

  it("opens Settings", async () => {
    await renderPalette();
    fireEvent.click(screen.getByRole("option", { name: /Open Settings/ }));
    expect(window.location.hash).toBe("#settings");
  });

  it("turns text that matches no command into a history search", async () => {
    const props = await renderPalette();
    fireEvent.change(field(), { target: { value: "  invoice 2291 " } });
    const list = screen.getByRole("listbox", { name: "Commands" });
    expect(within(list).queryAllByRole("option")).toHaveLength(0);
    expect(list.textContent).toContain("No commands match “invoice 2291”");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(props.onSearch).toHaveBeenCalledWith("invoice 2291");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("keeps Tab inside, and closes on Escape or the keys that opened it", async () => {
    const props = await renderPalette();
    fireEvent.keyDown(field(), { key: "Tab" });
    expect(document.activeElement === field()).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: "Escape" });
    fireEvent.keyDown(field(), { key: "k", ctrlKey: true });
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
