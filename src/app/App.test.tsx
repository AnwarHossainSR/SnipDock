import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { emit } from "@tauri-apps/api/event";
import { mockTauri } from "../test/setup";
import App from "./App";

describe("App", () => {
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
    expect(screen.getByRole("navigation", { name: "Primary" }).querySelectorAll("a")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Templates" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Projects" })).toBeNull();
    expect(screen.getByText("Local-first")).toBeDefined();
    expect(screen.queryByText("Offline")).toBeNull();
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

    fireEvent.keyDown(searchbox, { key: "Escape" });
    expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
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
});
