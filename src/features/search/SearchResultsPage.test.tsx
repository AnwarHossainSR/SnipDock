import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { LibraryItem, SearchQuery } from "../../api/types";
import { mockTauri } from "../../test/setup";
import SearchResultsPage from "./SearchResultsPage";

const item: LibraryItem = {
  id: "result-1",
  kind: "clipboard",
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
  created_at: "2026-07-19T00:00:00.000Z",
  updated_at: "2026-07-19T00:00:00.000Z",
};

describe("SearchResultsPage", () => {
  it("searches clipboard history with the controlled query", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [item], total: 1, limit: 20, offset: 0 };
      }
    });

    render(<SearchResultsPage query="deploy" />);

    expect(await screen.findByRole("heading", { name: "Deploy API" })).toBeDefined();
    await waitFor(() => expect(queries.some((query) => query.text === "deploy")).toBe(true));
    const query = queries.find((candidate) => candidate.text === "deploy");
    expect(query?.kinds).toEqual(["clipboard"]);
  });

  it("starts a changed query from the first page", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((_command, args) => {
      const query = (args as { query: SearchQuery }).query;
      queries.push(query);
      return { items: [item], total: 41, limit: 20, offset: query.offset };
    });

    const view = render(<SearchResultsPage query="deploy" />);
    await screen.findByRole("heading", { name: "Deploy API" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(queries.some((query) => query.text === "deploy" && query.offset === 20)).toBe(true),
    );

    view.rerender(<SearchResultsPage query="docker" />);

    await waitFor(() =>
      expect(queries.some((query) => query.text === "docker" && query.offset === 0)).toBe(true),
    );
  });
});
