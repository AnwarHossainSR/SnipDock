import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import App from "../../app/App";
import type { LibraryItem, Project } from "../../api/types";
import { mockTauri } from "../../test/setup";
import ProjectsPanel from "./ProjectsPanel";

const apollo: Project = {
  id: "project-apollo",
  name: "Apollo",
  description: "Release automation",
  archived_at: null,
  created_at: "2026-07-10T00:00:00.000Z",
  updated_at: "2026-07-16T00:00:00.000Z",
};

const legacy: Project = {
  id: "project-legacy",
  name: "Legacy",
  description: null,
  archived_at: "2026-07-12T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-12T00:00:00.000Z",
};

const snippet: LibraryItem = {
  id: "snippet-1",
  kind: "snippet",
  title: "Deploy API",
  description: null,
  content: "bun run deploy",
  notes: null,
  content_type: "shell",
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
  created_at: "2026-07-16T10:00:00.000Z",
  updated_at: "2026-07-16T10:00:00.000Z",
};

function page(items: LibraryItem[]) {
  return { items, total: items.length, limit: 200, offset: 0 };
}

describe("ProjectsPanel", () => {
  it("opens the projects view from the application hash", async () => {
    window.location.hash = "#projects";
    mockTauri((command) => {
      if (command === "list_projects") return [];
      if (command === "search_items") return page([]);
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "New project" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Projects" })).toBeDefined();
    window.location.hash = "";
  });

  it("lists active projects and shows the selected description and items", async () => {
    mockTauri((command, args) => {
      if (command === "list_projects") {
        expect((args as { includeArchived: boolean }).includeArchived).toBe(true);
        return [apollo, legacy];
      }
      if (command === "search_items") {
        return page([{ ...snippet, project_id: apollo.id }]);
      }
    });

    render(<ProjectsPanel />);

    expect(await screen.findByRole("heading", { name: "Apollo" })).toBeDefined();
    expect(screen.getByText("Release automation")).toBeDefined();
    // Archived project hidden until requested.
    expect(screen.queryByRole("option", { name: /Legacy/ })).toBeNull();
    // The assigned item appears under recent activity.
    expect(screen.getByText("Deploy API")).toBeDefined();
  });

  it("reveals archived projects on request", async () => {
    mockTauri((command) => {
      if (command === "list_projects") return [apollo, legacy];
      if (command === "search_items") return page([]);
    });

    render(<ProjectsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Show archived" }));

    expect(screen.getByRole("option", { name: /Legacy/ })).toBeDefined();
  });

  it("creates a project through the editor", async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "list_projects") return [];
      if (command === "search_items") return page([]);
      if (command === "save_project") {
        const input = (args as { input: { name: string; description: string | null } }).input;
        return {
          ...apollo,
          id: "project-new",
          name: input.name,
          description: input.description,
        };
      }
    });

    render(<ProjectsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mercury" } });
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    expect(await screen.findByRole("heading", { name: "Mercury" })).toBeDefined();
    expect(calls.some((call) => call.command === "save_project")).toBe(true);
  });

  it("archives the selected project", async () => {
    const flags: Array<boolean | null | undefined> = [];
    mockTauri((command, args) => {
      if (command === "list_projects") return [apollo];
      if (command === "search_items") return page([]);
      if (command === "save_project") {
        const input = (args as { input: { archived?: boolean | null } }).input;
        flags.push(input.archived);
        return { ...apollo, archived_at: input.archived ? "2026-07-17T00:00:00.000Z" : null };
      }
    });

    render(<ProjectsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));

    await waitFor(() => expect(screen.getByText("Project archived")).toBeDefined());
    expect(flags).toEqual([true]);
  });

  it("moves an item into a project and back out", async () => {
    let stored: LibraryItem = { ...snippet };
    const moves: Array<{ id: string; projectId: string | null }> = [];
    mockTauri((command, args) => {
      if (command === "list_projects") return [apollo];
      if (command === "search_items") return page([stored]);
      if (command === "move_item") {
        const move = args as { id: string; projectId: string | null };
        moves.push(move);
        stored = { ...stored, project_id: move.projectId };
        return stored;
      }
    });

    render(<ProjectsPanel />);

    await screen.findByRole("heading", { name: "Apollo" });
    fireEvent.change(screen.getByLabelText(/Item to move into/), {
      target: { value: snippet.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move in" }));

    expect(await screen.findByRole("button", { name: "Remove" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(moves).toEqual([
      { id: snippet.id, projectId: apollo.id },
      { id: snippet.id, projectId: null },
    ]));
  });
});
