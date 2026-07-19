import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { mockTauri } from "../../test/setup";
import LibraryOrganization from "./LibraryOrganization";

describe("LibraryOrganization", () => {
  it("switches between projects and category/tag management", async () => {
    mockTauri((command) => {
      if (command === "list_projects" || command === "list_categories" || command === "list_tags") return [];
      if (command === "search_items") return { items: [], total: 0, limit: 200, offset: 0 };
    });

    render(<LibraryOrganization />);

    expect(await screen.findByRole("button", { name: "New project" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Categories & tags" }));
    expect(await screen.findByRole("heading", { name: "Categories and tags" })).toBeDefined();
  });
});
