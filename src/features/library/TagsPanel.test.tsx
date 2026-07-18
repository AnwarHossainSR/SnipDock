import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { Category, Tag } from "../../lib/types";
import { mockTauri } from "../../test/setup";
import CategorySelect from "./CategorySelect";
import TagsPanel from "./TagsPanel";

const builtIn: Category = { id: "builtin-api", name: "API", built_in: true };
const custom: Category = { id: "cat-frontend", name: "Frontend", built_in: false };

const rust: Tag = { id: "tag-rust", name: "Rust", color: "#1d4ed8", usage_count: 2 };
const go: Tag = { id: "tag-go", name: "Go", color: "#00add8", usage_count: 1 };

describe("TagsPanel", () => {
  it("loads categories and tags with usage and origin labels", async () => {
    mockTauri((command) => {
      if (command === "list_categories") return [builtIn, custom];
      if (command === "list_tags") return [rust, go];
    });

    render(<TagsPanel />);

    expect(await screen.findByRole("heading", { name: "Categories and tags" })).toBeDefined();
    expect(screen.getByText("Built-in")).toBeDefined();
    expect(screen.getByText("Custom")).toBeDefined();
    expect(screen.getByRole("option", { name: /Rust/ })).toBeDefined();
    expect(screen.getByText("Used 2 times")).toBeDefined();
    expect(screen.getByText("Used 1 time")).toBeDefined();
  });

  it("creates a custom category", async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "list_categories") return [builtIn];
      if (command === "list_tags") return [];
      if (command === "save_category") {
        const input = (args as { input: { name: string } }).input;
        return { id: "cat-new", name: input.name, built_in: false };
      }
    });

    render(<TagsPanel />);

    fireEvent.change(await screen.findByLabelText("Category name"), {
      target: { value: "Backend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByText("Backend")).toBeDefined();
    expect(calls).toContainEqual({
      command: "save_category",
      args: { input: { id: null, name: "Backend" } },
    });
  });

  it("renames a custom category but hides rename for built-ins", async () => {
    mockTauri((command, args) => {
      if (command === "list_categories") return [builtIn, custom];
      if (command === "list_tags") return [];
      if (command === "save_category") {
        const input = (args as { input: { id: string | null; name: string } }).input;
        return { id: input.id ?? "cat-x", name: input.name, built_in: false };
      }
    });

    render(<TagsPanel />);

    // Only the custom category exposes a rename control.
    expect((await screen.findAllByRole("button", { name: "Rename" })).length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename category"), {
      target: { value: "Frontend UI" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Frontend UI")).toBeDefined();
  });

  it("creates a tag with a chosen color", async () => {
    const calls: { command: string; args: unknown }[] = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "list_categories") return [];
      if (command === "list_tags") return [];
      if (command === "save_tag") {
        const input = (args as { input: { name: string; color: string } }).input;
        return { id: "tag-new", name: input.name, color: input.color, usage_count: 0 };
      }
    });

    render(<TagsPanel />);

    fireEvent.change(await screen.findByLabelText("New tag name"), { target: { value: "SQL" } });
    fireEvent.change(screen.getByLabelText("New tag color"), { target: { value: "#c43d4d" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));

    expect(await screen.findByRole("option", { name: /SQL/ })).toBeDefined();
    expect(calls).toContainEqual({
      command: "save_tag",
      args: { input: { id: null, name: "SQL", color: "#c43d4d" } },
    });
  });

  it("edits the selected tag name and color", async () => {
    let current = { ...rust };
    mockTauri((command, args) => {
      if (command === "list_categories") return [];
      if (command === "list_tags") return [current];
      if (command === "save_tag") {
        const input = (args as { input: { name: string; color: string } }).input;
        current = { ...current, name: input.name, color: input.color };
        return current;
      }
    });

    render(<TagsPanel />);

    fireEvent.click(await screen.findByRole("option", { name: /Rust/ }));
    fireEvent.change(screen.getByLabelText("Tag name"), { target: { value: "Rustlang" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tag" }));

    expect(await screen.findByRole("option", { name: /Rustlang/ })).toBeDefined();
  });

  it("merges the selected tag into another", async () => {
    let tags = [rust, go];
    const calls: { command: string; args: unknown }[] = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "list_categories") return [];
      if (command === "list_tags") return tags;
      if (command === "merge_tags") {
        const merged = { ...go, usage_count: go.usage_count + rust.usage_count };
        tags = [merged];
        return merged;
      }
    });

    render(<TagsPanel />);

    fireEvent.click(await screen.findByRole("option", { name: /Rust/ }));
    fireEvent.change(screen.getByLabelText("Merge target"), { target: { value: go.id } });
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await screen.findByText("Merged into “Go”.");
    expect(screen.queryByRole("option", { name: /Rust/ })).toBeNull();
    expect(calls).toContainEqual({
      command: "merge_tags",
      args: { sourceId: rust.id, targetId: go.id },
    });
  });
});

describe("CategorySelect", () => {
  it("emits the chosen category id and clears to null", () => {
    const changes: Array<string | null> = [];
    render(
      <CategorySelect
        categories={[builtIn, custom]}
        value={null}
        onChange={(id) => changes.push(id)}
      />,
    );

    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: custom.id } });
    fireEvent.change(select, { target: { value: "" } });

    expect(changes).toEqual([custom.id, null]);
  });
});
