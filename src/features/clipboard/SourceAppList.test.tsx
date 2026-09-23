import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import { mockTauri } from "../../test/setup";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import { SourceFilterButton, SourceAppList } from "./SourceAppList";

describe("SourceAppList", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("lists each source with its count in descending order", async () => {
    mockTauri((command) => {
      if (command === "get_source_app_counts") {
        return [
          { source_app: "Code.exe", count: 12 },
          { source_app: "firefox", count: 8 },
          { source_app: null, count: 3 },
        ];
      }
      return undefined;
    });

    render(<SourceAppList active={null} onSelect={() => {}} />);

    expect(await screen.findByRole("button", { name: /All sources/i })).toBeDefined();
    // Order follows the backend: highest count first, "Unknown source" last.
    const items = screen.getAllByRole("listitem");
    const labels = items.map((item) => item.textContent ?? "");
    const codeIndex = labels.findIndex((label) => label.startsWith("Code.exe"));
    const firefoxIndex = labels.findIndex((label) => label.startsWith("firefox"));
    const unknownIndex = labels.findIndex((label) => label.startsWith("Unknown source"));
    expect(codeIndex).toBeLessThan(firefoxIndex);
    expect(firefoxIndex).toBeLessThan(unknownIndex);
    expect(items[codeIndex].textContent).toContain("12");
    expect(items[unknownIndex].textContent).toContain("3");
  });

  // A count moves when something is captured, and not when the history is
  // filtered. The list used to refetch on every change to the store's rows,
  // which a filter click makes twice.
  it("re-reads the counts after a capture, but not after a filter click", async () => {
    let reads = 0;
    mockTauri((command) => {
      if (command === "get_source_app_counts") {
        reads += 1;
        return [{ source_app: "Code.exe", count: reads }];
      }
      if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
      return undefined;
    });
    render(<SourceAppList active={null} onSelect={() => {}} />);
    await screen.findByText("Code.exe");
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    const atMount = reads;

    useClipboardStore.getState().setFilter("code");
    await settle();
    useClipboardStore.getState().setFilter("all");
    await settle();
    expect(reads).toBe(atMount);

    useClipboardStore.getState().prependItem({
      id: "fresh", kind: "clipboard", title: null, description: null, content: "x", notes: null,
      content_type: "plain_text", language: null, project_id: null, category_id: null,
      pinned: false, favorite: false, private: false, tag_ids: [], archived_at: null,
      expires_at: null, usage_count: 0, last_used_at: null, source_app: "Code.exe",
      created_at: "2026-07-17T10:00:00.000Z", updated_at: "2026-07-17T10:00:00.000Z",
    });
    await waitFor(() => expect(reads).toBe(atMount + 1));
  });

  it("renders the empty-state message when no sources exist", async () => {
    mockTauri(() => []);
    render(<SourceAppList active={null} onSelect={() => {}} />);
    expect(await screen.findByText(/Sources show up here once you copy something/i)).toBeDefined();
  });

  it("calls onSelect with the chosen value and resets to null for 'All sources'", async () => {
    const calls: (string | null)[] = [];
    mockTauri(() => [
      { source_app: "Code.exe", count: 4 },
    ]);
    render(<SourceAppList active={null} onSelect={(value) => calls.push(value)} />);

    fireEvent.click(await screen.findByRole("button", { name: /Code.exe/i }));
    expect(calls).toEqual(["Code.exe"]);

    fireEvent.click(screen.getByRole("button", { name: /All sources/i }));
    expect(calls).toEqual(["Code.exe", null]);
  });
});

describe("SourceFilterButton", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  it("opens the popover, lists the sources, and applies the picked one", async () => {
    mockTauri((command) => {
      if (command === "get_source_app_counts") {
        return [
          { source_app: "Code.exe", count: 9 },
          { source_app: "firefox", count: 2 },
        ];
      }
      return undefined;
    });

    render(<SourceFilterButton />);

    const trigger = screen.getByRole("button", { name: /Source/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.click(await screen.findByRole("button", { name: /Code.exe/i }));

    expect(useClipboardStore.getState().sourceApps).toEqual(["Code.exe"]);
    // The popover closes once a value is chosen.
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
  });

  it("reflects the active filter in the button label", () => {
    useClipboardStore.getState().setSourceApps(["Code.exe"]);
    mockTauri(() => []);
    render(<SourceFilterButton />);
    expect(screen.getByRole("button", { name: /Code.exe/i })).toBeDefined();
  });
});
