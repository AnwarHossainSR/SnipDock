import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, mock, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import LibraryMenu from "./LibraryMenu";

const stamp = "2026-07-17T10:00:00.000Z";
const pinnedItem = {
  id: "pinned-1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "connection: { host: \"app-db.example.com\", user: \"cloud\" }",
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
  created_at: stamp,
  updated_at: stamp,
};

beforeEach(() => {
  resetClipboardStore();
});

function library(pinned = [pinnedItem]) {
  mockTauri((command) => {
    if (command === "search_items") return { items: pinned, total: pinned.length, limit: 8, offset: 0 };
    if (command === "get_source_app_counts") return [{ source_app: "Code.exe", count: 4 }];
    if (command === "list_smart_folders") {
      return [{ id: "f1", name: "Deploy commands", description: null, query: {}, icon: "terminal", color: "#12695a", position: 0, created_at: stamp, updated_at: stamp }];
    }
    if (command === "list_tags") return [{ id: "t1", name: "api", color: "#12695a", usage_count: 1 }];
    if (command === "list_projects") {
      return [{ id: "p1", name: "Storefront", description: null, archived_at: null, created_at: stamp, updated_at: stamp }];
    }
    return undefined;
  });
}

test("keeps the library behind one button that says whether it is open", async () => {
  library();
  render(<LibraryMenu onNavigate={() => {}} />);
  const trigger = screen.getByRole("button", { name: "Library" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("region", { name: "Library" })).toBeNull();

  fireEvent.click(trigger);
  const panel = screen.getByRole("region", { name: "Library" });
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  // Everything the sidebar listed is here.
  for (const heading of ["Pinned", "Sources", "Saved searches", "Tags", "Projects"]) {
    await waitFor(() =>
      expect(
        [...panel.querySelectorAll("p")].some((p) => p.textContent?.trim().startsWith(heading)),
        `${heading} is missing from the library`,
      ).toBe(true),
    );
  }

  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "Library" })).toBeNull();
  expect(document.activeElement === trigger).toBe(true);
});

test("asks the desk to reveal a pinned capture, and brings the desk forward", async () => {
  library();
  const onNavigate = mock(() => {});
  render(<LibraryMenu onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "Library" }));

  fireEvent.click(await screen.findByRole("button", { name: /connection/ }));

  expect(useClipboardStore.getState().focusRequest?.id).toBe("pinned-1");
  expect(onNavigate).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("region", { name: "Library" })).toBeNull();
});

test("narrows the desk to a source", async () => {
  library();
  render(<LibraryMenu onNavigate={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Library" }));

  fireEvent.click(await screen.findByRole("button", { name: /^Code\.exe/ }));

  expect(useClipboardStore.getState().sourceApps).toEqual(["Code.exe"]);
});

test("invites a first pin instead of showing an empty pinned list", async () => {
  library([]);
  render(<LibraryMenu onNavigate={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Library" }));

  expect(await screen.findByText("Pin a capture to keep it one click away.")).toBeDefined();
});
