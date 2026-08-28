import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockTauri } from "../../test/setup";
import DuplicatesPanel from "./DuplicatesPanel";

function group(hash: string, items: { id: string; uses: number; created: string }[]) {
  return {
    content_hash: hash,
    count: items.length,
    items: items.map((entry) => ({
      id: entry.id,
      title: `Copy ${entry.id}`,
      content_type: "plain_text",
      created_at: entry.created,
      usage_count: entry.uses,
    })),
  };
}

describe("DuplicatesPanel", () => {
  test("reports the number of groups without being asked to look", async () => {
    mockTauri((command) => (command === "get_duplicate_count" ? 3 : undefined));
    render(<DuplicatesPanel />);

    expect(await screen.findByText("3 groups of copies in your history.")).toBeDefined();
  });

  test("says so plainly when nothing repeats", async () => {
    mockTauri((command) => (command === "get_duplicate_count" ? 0 : undefined));
    render(<DuplicatesPanel />);

    expect(await screen.findByText("No repeated captures. Nothing to merge.")).toBeDefined();
  });

  test("merges into the copy used most and keeps the rest of the list", async () => {
    const calls: InvokeArgs[] = [];
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "get_duplicate_count") return 2;
      if (command === "find_duplicates") {
        return [
          group("hash-a", [
            { id: "new", uses: 1, created: "2026-08-02T00:00:00.000Z" },
            { id: "loved", uses: 9, created: "2026-08-01T00:00:00.000Z" },
          ]),
          group("hash-b", [
            { id: "b1", uses: 0, created: "2026-08-03T00:00:00.000Z" },
            { id: "b2", uses: 0, created: "2026-08-04T00:00:00.000Z" },
          ]),
        ];
      }
      if (command === "merge_duplicates") {
        if (args) calls.push(args);
        return 1;
      }
      return undefined;
    });
    render(<DuplicatesPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Review duplicates" }));
    const merges = await screen.findAllByRole("button", { name: "Merge 1" });
    fireEvent.click(merges[0]);

    await waitFor(() => expect(calls).toHaveLength(1));
    // The most-used copy is the one kept, not the newest.
    expect(calls[0]).toEqual({ keepId: "loved", duplicateIds: ["new"] });
    expect(await screen.findByText("1 copy merged")).toBeDefined();
    const remaining = within(screen.getByRole("list", { name: "Duplicate groups" }));
    expect(remaining.getAllByRole("button", { name: /^Merge / })).toHaveLength(1);
  });

  test("breaks ties on age, keeping the copy the history already points at", async () => {
    const calls: InvokeArgs[] = [];
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "get_duplicate_count") return 1;
      if (command === "find_duplicates") {
        return [
          group("hash-a", [
            { id: "newer", uses: 0, created: "2026-08-05T00:00:00.000Z" },
            { id: "older", uses: 0, created: "2026-08-01T00:00:00.000Z" },
          ]),
        ];
      }
      if (command === "merge_duplicates") {
        if (args) calls.push(args);
        return 1;
      }
      return undefined;
    });
    render(<DuplicatesPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Review duplicates" }));
    fireEvent.click(await screen.findByRole("button", { name: "Merge 1" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ keepId: "older", duplicateIds: ["newer"] });
  });

  test("surfaces a failed merge instead of pretending it worked", async () => {
    mockTauri((command) => {
      if (command === "get_duplicate_count") return 1;
      if (command === "find_duplicates") {
        return [
          group("hash-a", [
            { id: "a", uses: 2, created: "2026-08-01T00:00:00.000Z" },
            { id: "b", uses: 1, created: "2026-08-02T00:00:00.000Z" },
          ]),
        ];
      }
      if (command === "merge_duplicates") throw new Error("database is locked");
      return undefined;
    });
    render(<DuplicatesPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Review duplicates" }));
    fireEvent.click(await screen.findByRole("button", { name: "Merge 1" }));

    expect(await screen.findByRole("alert")).toBeDefined();
    // The group is still listed, because it is still there.
    expect(screen.getByRole("button", { name: "Merge 1" })).toBeDefined();
  });
});
