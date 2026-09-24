import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import { emit } from "@tauri-apps/api/event";
import { mockTauri } from "../test/setup";
import { resetClipboardStore } from "../stores/clipboardStore";
import App from "./App";

/** Enough of a settings blob for `SettingsPage` to render; the panel reads
 *  several of these unconditionally. */
const fullSettings = {
  clipboard_tracking: true,
  history_days: 30,
  max_items: 500,
  ignored_apps: [],
  ignored_patterns: [],
  ignored_content_types: [],
  theme: "system",
  accent: "teal",
  minimize_to_tray: true,
  start_with_system: true,
  formatter_indent: 2,
  custom_shortcuts: {},
  paste_format: "preserve",
  clipboard_page_size: 100,
  updates: {
    notify: true,
    frequency: "on_launch",
    skipped_version: null,
    last_checked_at: null,
  },
  backup: {
    schedule: "manual",
    local: true,
    local_dir: "",
    keep: 10,
    cloud: {
      provider: "none",
      bucket: "",
      region: "",
      endpoint: "",
      prefix: "",
      access_key_id: "",
      secret_access_key: "",
      passphrase: "",
    },
    last_run_at: null,
    last_result: null,
  },
};

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    // The hash is the router, and it is global. A test that navigates would
    // otherwise leave every test after it on the destination it left behind.
    window.location.hash = "#clipboard";
    // The history store outlives a render, and the first fetch now waits for
    // settings, so a status left behind by an earlier test would stand in for
    // the one this test is asserting on.
    resetClipboardStore();
  });

  it("renders an accessible application shell", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);

    expect(screen.getByRole("heading", { name: "SnipDock" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
    const searchbox = screen.getByRole("searchbox", {
      name: "Search clipboard",
    });

    expect(searchbox).toBeDefined();
    expect(searchbox.closest("form")).toBeNull();
    expect(screen.queryByText("Ctrl K")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Clipboard" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("navigation", { name: "Primary" }).querySelectorAll("a")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Tools" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Templates" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Projects" })).toBeNull();
    expect(screen.queryByText("Local-first")).toBeNull();
    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
  });

  it("searches clipboard history and clears with Escape", async () => {
    const queries: unknown[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") queries.push(args);
      return { items: [], total: 0, limit: 20, offset: 0 };
    });
    render(<App />);
    const searchbox = screen.getByRole("searchbox", { name: "Search clipboard" });

    fireEvent.change(searchbox, { target: { value: "token" } });
    expect(await screen.findByRole("heading", { name: "Search results" })).toBeDefined();
    await waitFor(() => expect(queries.some((entry) => JSON.stringify(entry).includes('"clipboard"'))).toBe(true));

    // The field lives inside the page, so switching to the results remounts
    // it. It keeps focus across that swap, which is what lets someone keep
    // typing - and Escape goes to the live field, not the replaced one.
    const live = screen.getByRole("searchbox", { name: "Search clipboard" });
    expect(document.activeElement).toBe(live);
    fireEvent.keyDown(live, { key: "Escape" });
    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
  });

  // The results page appears on the first keystroke but is handed the
  // debounced query, which is still empty for that first 300ms. It used to run
  // that empty query as a search, so the whole history flashed up as "results"
  // before the real answer replaced it.
  it("never shows the unfiltered history as search results", async () => {
    const searches: { text: unknown }[] = [];
    const everything = { ...fullSettings };
    mockTauri((command, args) => {
      if (command === "get_settings") return everything;
      if (command === "search_items") {
        const query = (args as { query: { text: unknown; limit: number } }).query;
        // The history page's own loads ask for 100 rows; the results page 20.
        if (query.limit === 20) searches.push({ text: query.text });
        return { items: [], total: 0, limit: query.limit, offset: 0 };
      }
      return undefined;
    });
    render(<App />);
    await screen.findByText("Your clipboard is quiet");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search clipboard" }), {
      target: { value: "kubectl" },
    });
    expect(await screen.findByRole("heading", { name: "Search results" })).toBeDefined();
    // Before the debounce: waiting, not a result list.
    expect(screen.getByText("Searching…")).toBeDefined();
    expect(searches).toEqual([]);

    await waitFor(() => expect(searches).toEqual([{ text: "kubectl" }]));
  });

  it("leaves search results when a pinned item is opened from the sidebar", async () => {
    const pinned = {
      id: "pinned-1",
      kind: "clipboard",
      title: null,
      description: null,
      content: "deploy-token-rotation-notes",
      notes: null,
      content_type: "plain_text",
      language: null,
      project_id: null,
      category_id: null,
      pinned: true,
      favorite: false,
      private: false,
      tag_ids: [],
      archived_at: null,
      expires_at: null,
      usage_count: 0,
      last_used_at: null,
      created_at: "2026-07-17T10:00:00.000Z",
      updated_at: "2026-07-17T10:00:00.000Z",
    };
    mockTauri((command) => {
      if (command === "search_items") return { items: [pinned], total: 1, limit: 30, offset: 0 };
      if (command === "get_settings") return { clipboard_tracking: true };
      return undefined;
    });
    render(<App />);

    const searchbox = screen.getByRole("searchbox", { name: "Search clipboard" });
    fireEvent.change(searchbox, { target: { value: "token" } });
    expect(await screen.findByRole("heading", { name: "Search results" })).toBeDefined();

    fireEvent.click(await screen.findByRole("button", { name: /deploy-token-rotation-notes/ }));

    expect(await screen.findByRole("heading", { name: "Recent captures" })).toBeDefined();
    const cleared = screen.getByRole("searchbox", { name: "Search clipboard" }) as HTMLInputElement;
    expect(cleared.value).toBe("");
  });

  // The query used to outrank the destination, so with anything in the search
  // box the Settings link changed the hash, changed `page`, and left the
  // results on screen over the top of both. Clearing an unrelated search box
  // was the undocumented prerequisite for opening Settings.
  it("opens Settings while the search box has text", async () => {
    mockTauri((command) => {
      if (command === "search_items") return { items: [], total: 0, limit: 20, offset: 0 };
      if (command === "get_settings") return fullSettings;
      return undefined;
    });
    render(<App />);

    const searchbox = screen.getByRole("searchbox", { name: "Search clipboard" });
    fireEvent.change(searchbox, { target: { value: "token" } });
    expect(await screen.findByRole("heading", { name: "Search results" })).toBeDefined();

    window.location.hash = "#settings";
    fireEvent(window, new window.HashChangeEvent("hashchange"));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Search results" })).toBeNull();

    // Leaving a destination drops the query with it, so coming back to the
    // history shows the history rather than the search it replaced.
    window.location.hash = "#clipboard";
    fireEvent(window, new window.HashChangeEvent("hashchange"));

    expect(await screen.findByRole("heading", { name: "Recent captures" })).toBeDefined();
    const cleared = screen.getByRole("searchbox", { name: "Search clipboard" }) as HTMLInputElement;
    expect(cleared.value).toBe("");
  });

  it("renders history loading state", () => {
    mockTauri(() => new Promise(() => {}));
    render(<App />);

    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading history…")).toBeDefined();
  });

  it("renders history error state", async () => {
    mockTauri((command) => {
      if (command === "get_settings") return { clipboard_tracking: true };
      throw new Error("database unavailable");
    });
    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Clipboard history unavailable",
    );
  });

  it("focuses the search box when the window is shown from the tray", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);
    const searchbox = await screen.findByRole("searchbox", {
      name: "Search clipboard",
    });
    searchbox.blur();

    await emit("app://shown");

    await waitFor(() => expect(document.activeElement).toBe(searchbox));
  });

  it("focuses the search box on in-window Ctrl+Shift+F", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);
    const searchbox = await screen.findByRole("searchbox", {
      name: "Search clipboard",
    });
    searchbox.blur();

    fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true });

    await waitFor(() => expect(document.activeElement).toBe(searchbox));
  });

  it("opens the command palette on Ctrl+K and hands focus back on Escape", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);
    const searchbox = await screen.findByRole("searchbox", { name: "Search clipboard" });
    searchbox.focus();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const field = await screen.findByRole("combobox", { name: "Command or search" });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeDefined();
    expect(document.activeElement === field).toBe(true);

    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    await waitFor(() => expect(document.activeElement === searchbox).toBe(true));
  });

  it("opens the Save dialog from the palette", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);
    await screen.findByRole("searchbox", { name: "Search clipboard" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const field = await screen.findByRole("combobox", { name: "Command or search" });

    fireEvent.change(field, { target: { value: "save an item" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Save an item" })).toBeDefined();
  });

  it("searches the history for text that matches no command", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);
    await screen.findByRole("searchbox", { name: "Search clipboard" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const field = await screen.findByRole("combobox", { name: "Command or search" });

    fireEvent.change(field, { target: { value: "invoice 2291" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect((screen.getByRole("searchbox", { name: "Search clipboard" }) as HTMLInputElement).value).toBe("invoice 2291"),
    );
    // The field was remounted by the swap to results; focus follows it there.
    await waitFor(() =>
      expect(document.activeElement === screen.getByRole("searchbox", { name: "Search clipboard" })).toBe(true),
    );
  });

  it("keeps the selected-item shortcuts off the page behind the palette", async () => {
    mockTauri(() => ({ items: [], total: 0, limit: 100, offset: 0 }));
    render(<App />);
    const searchbox = await screen.findByRole("searchbox", { name: "Search clipboard" });
    searchbox.blur();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByRole("combobox", { name: "Command or search" });

    // Focus search is one of them; with the palette up it must not fire.
    fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement === searchbox).toBe(false);
  });

  // A "What's new" dialog used to open on the first launch after any version
  // change, and reappeared on every launch wherever the webview's storage did
  // not survive. Nothing now interrupts a launch except a real update.
  it("opens with no dialog when the running version is the newest", async () => {
    mockTauri((command) => {
      if (command === "plugin:app|version") return "0.1.4";
      if (command === "plugin:window|is_visible") return true;
      if (command === "check_for_update") return null;
      if (command === "get_settings") return { clipboard_tracking: true };
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
    });

    render(<App />);
    await screen.findByRole("searchbox", { name: "Search clipboard" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("interrupts a launch only for an update that is actually available", async () => {
    mockTauri((command) => {
      if (command === "plugin:app|version") return "0.1.4";
      if (command === "plugin:window|is_visible") return true;
      if (command === "check_for_update") {
        return { version: "0.2.0", notes: "Next release", date: null };
      }
      if (command === "get_settings") return { clipboard_tracking: true };
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
    });

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
    expect(screen.getByText("Next release")).toBeDefined();
  });
});
