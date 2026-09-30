import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, mock, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import AppHeader from "./AppHeader";

beforeEach(() => {
  resetClipboardStore();
  mockTauri((command) => {
    if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
    return undefined;
  });
});

function header(overrides: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const props = {
    page: "clipboard" as const,
    trackingPaused: false,
    onToggleTracking: mock(() => {}),
    onShowDesk: mock(() => {}),
    onSaveItem: mock(() => {}),
    ...overrides,
  };
  render(<AppHeader {...props} />);
  return props;
}

const nav = () => screen.getByRole("navigation", { name: "Primary" });
const current = () => nav().querySelector('[aria-current="page"]')?.textContent;

test("marks where you are: the desk, pinned, or settings", () => {
  header();
  expect(current()).toBe("Desk");
});

test("Pinned is the desk narrowed to pinned captures, and Desk undoes it", () => {
  const props = header();
  fireEvent.click(screen.getByRole("link", { name: "Pinned" }));
  expect(useClipboardStore.getState().filter).toBe("pinned");
  expect(props.onShowDesk).toHaveBeenCalledTimes(1);
  expect(current()).toBe("Pinned");

  fireEvent.click(screen.getByRole("link", { name: "Desk" }));
  expect(useClipboardStore.getState().filter).toBe("all");
  expect(current()).toBe("Desk");
});

test("marks Settings on the settings page", () => {
  header({ page: "settings" });
  expect(current()).toBe("Settings");
});

test("offers capture and Save item from every page", () => {
  const props = header({ page: "settings" });
  fireEvent.click(screen.getByRole("button", { name: /^Capturing.*pause tracking/ }));
  expect(props.onToggleTracking).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Save item" }));
  expect(props.onSaveItem).toHaveBeenCalledTimes(1);
});

test("says Snippets is coming rather than offering it", () => {
  header();
  const snippets = screen.getByText("Snippets").closest("[aria-disabled]");
  expect(snippets?.getAttribute("aria-disabled")).toBe("true");
  expect(screen.queryByRole("link", { name: /Snippets/ })).toBeNull();
});
