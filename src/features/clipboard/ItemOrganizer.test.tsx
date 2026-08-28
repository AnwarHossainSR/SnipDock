import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockTauri } from "../../test/setup";
import type { LibraryItem } from "../../api/types";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import ItemOrganizer from "./ItemOrganizer";

const item: LibraryItem = {
  id: "item-1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "deploy notes",
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
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const work = { id: "tag-work", name: "work", color: "#3b82f6", usage_count: 2 };
const urgent = { id: "tag-urgent", name: "urgent", color: "#ef4444", usage_count: 0 };
const project = {
  id: "project-1",
  name: "Release",
  description: null,
  archived_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("ItemOrganizer", () => {
  beforeEach(() => {
    resetClipboardStore();
  });

  test("adds a tag the capture does not have yet", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "list_tags") return [work, urgent];
      if (command === "list_projects") return [];
      if (command === "set_item_tags") {
        received = args;
        return { ...item, tag_ids: ["tag-work"] };
      }
      return undefined;
    });
    render(<ItemOrganizer item={item} />);

    fireEvent.click(await screen.findByRole("button", { name: "work" }));

    await waitFor(() => expect(received).toEqual({ id: "item-1", tagIds: ["tag-work"] }));
  });

  test("removes a tag the capture already carries", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "list_tags") return [work, urgent];
      if (command === "list_projects") return [];
      if (command === "set_item_tags") {
        received = args;
        return { ...item, tag_ids: ["tag-urgent"] };
      }
      return undefined;
    });
    render(<ItemOrganizer item={{ ...item, tag_ids: ["tag-work", "tag-urgent"] }} />);

    fireEvent.click(await screen.findByRole("button", { name: "work" }));

    await waitFor(() => expect(received).toEqual({ id: "item-1", tagIds: ["tag-urgent"] }));
  });

  test("a tag made here is applied to the capture that prompted it", async () => {
    const calls: { command: string; args?: InvokeArgs }[] = [];
    mockTauri((command, args?: InvokeArgs) => {
      calls.push({ command, args });
      if (command === "list_tags") return [];
      if (command === "list_projects") return [];
      if (command === "save_tag") return urgent;
      if (command === "set_item_tags") return { ...item, tag_ids: ["tag-urgent"] };
      return undefined;
    });
    render(<ItemOrganizer item={item} />);

    fireEvent.click(await screen.findByRole("button", { name: "New tag" }));
    fireEvent.change(screen.getByLabelText("New tag name"), { target: { value: "urgent" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(calls.some((call) => call.command === "set_item_tags")).toBe(true));
    const applied = calls.find((call) => call.command === "set_item_tags");
    expect(applied?.args).toEqual({ id: "item-1", tagIds: ["tag-urgent"] });
  });

  test("files the capture under a project and clears it again", async () => {
    const moves: InvokeArgs[] = [];
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "list_tags") return [];
      if (command === "list_projects") return [project];
      if (command === "move_item") {
        if (args) moves.push(args);
        return { ...item, project_id: "project-1" };
      }
      return undefined;
    });
    render(<ItemOrganizer item={item} />);

    const select = await screen.findByLabelText("Project");
    fireEvent.change(select, { target: { value: "project-1" } });
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({ id: "item-1", projectId: "project-1" });

    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => expect(moves).toHaveLength(2));
    // "Not filed" has to reach the backend as null, not an empty string.
    expect(moves[1]).toEqual({ id: "item-1", projectId: null });
  });

  test("puts the updated capture back into the store so the list follows", async () => {
    mockTauri((command) => {
      if (command === "list_tags") return [work];
      if (command === "list_projects") return [];
      if (command === "set_item_tags") return { ...item, tag_ids: ["tag-work"] };
      return undefined;
    });
    useClipboardStore.setState({ items: [item], total: 1, status: "ready" });
    render(<ItemOrganizer item={item} />);

    fireEvent.click(await screen.findByRole("button", { name: "work" }));

    await waitFor(() =>
      expect(useClipboardStore.getState().items[0].tag_ids).toEqual(["tag-work"]),
    );
  });

  test("sets a self-destruct time as a UTC timestamp in the future", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "list_tags") return [];
      if (command === "list_projects") return [];
      if (command === "set_item_expiry") {
        received = args;
        return { ...item, expires_at: "2099-01-01T00:00:00.000Z" };
      }
      return undefined;
    });
    render(<ItemOrganizer item={item} />);

    fireEvent.click(await screen.findByRole("button", { name: "1 hour" }));

    await waitFor(() => expect(received).toBeDefined());
    const { id, expiresAt } = received as { id: string; expiresAt: string };
    expect(id).toBe("item-1");
    expect(expiresAt.endsWith("Z")).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("takes the timer off again with Never", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "list_tags") return [];
      if (command === "list_projects") return [];
      if (command === "set_item_expiry") {
        received = args;
        return { ...item, expires_at: null };
      }
      return undefined;
    });
    render(<ItemOrganizer item={{ ...item, expires_at: "2099-01-01T00:00:00.000Z" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Never" }));

    await waitFor(() => expect(received).toEqual({ id: "item-1", expiresAt: null }));
  });

  test("says when the capture is due to be removed", async () => {
    mockTauri((command) => {
      if (command === "list_tags") return [];
      if (command === "list_projects") return [];
      return undefined;
    });
    const inAnHour = new Date(Date.now() + 60 * 60_000).toISOString();
    render(<ItemOrganizer item={{ ...item, expires_at: inAnHour }} />);

    expect(await screen.findByText("Removed in 1 hour")).toBeDefined();
  });

  test("warns that a timer is final while none is set", async () => {
    mockTauri((command) => {
      if (command === "list_tags") return [];
      if (command === "list_projects") return [];
      return undefined;
    });
    render(<ItemOrganizer item={item} />);

    expect(
      await screen.findByText("A timer set here removes the capture for good, pinned or not."),
    ).toBeDefined();
  });

  test("reports a refused tag instead of showing it as applied", async () => {
    mockTauri((command) => {
      if (command === "list_tags") return [work];
      if (command === "list_projects") return [];
      if (command === "set_item_tags") throw new Error("tag is unavailable");
      return undefined;
    });
    render(<ItemOrganizer item={item} />);

    fireEvent.click(await screen.findByRole("button", { name: "work" }));

    expect((await screen.findByRole("alert")).textContent).toBe("tag is unavailable");
  });
});
