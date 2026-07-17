import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import App from "./App";

describe("App", () => {
  it("renders an accessible application shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "SnipDock" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
    const searchbox = screen.getByRole("searchbox", {
      name: "Search clipboard history and snippets",
    });

    expect(searchbox).toBeDefined();
    expect(searchbox.closest("form")).toBeNull();
    expect(screen.queryByText("Ctrl K")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Clipboard" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("status").textContent).toContain(
      "Your clipboard is quiet",
    );
  });

  it("renders the loading primitive", () => {
    render(<App state="loading" />);

    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading your workspace…")).toBeDefined();
  });

  it("renders the error primitive", () => {
    render(<App state="error" />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Workspace unavailable",
    );
  });
});
