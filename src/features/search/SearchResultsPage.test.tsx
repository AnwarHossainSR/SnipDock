import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";
import type { LibraryItem, SearchQuery } from "../../api/types";
import { mockTauri } from "../../test/setup";
import SearchResultsPage from "./SearchResultsPage";
import { resetClipboardStore } from "../../stores/clipboardStore";

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
  source_app: null,
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
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(queries.some((query) => query.text === "deploy" && query.offset === 20)).toBe(true),
    );

    view.rerender(<SearchResultsPage query="docker" />);

    await waitFor(() =>
      expect(queries.some((query) => query.text === "docker" && query.offset === 0)).toBe(true),
    );
  });

  it("regex mode sends the whole query as the regex field", async () => {
    const queries: SearchQuery[] = [];
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        return { items: [item], total: 1, limit: 20, offset: 0 };
      }
      return undefined;
    });

    render(<SearchResultsPage query="v\d+/users" />);
    await screen.findByRole("heading", { name: "Deploy API" });
    fireEvent.click(screen.getByRole("button", { name: "Regex" }));

    await waitFor(() => {
      const last = queries[queries.length - 1];
      expect(last.regex).toBe("v\\d+/users");
      expect(last.text).toBeNull();
    });
  });

  it("an invalid regex surfaces the typed error and keeps prior rows visible", async () => {
    const queries: SearchQuery[] = [];
    let mode: "ok" | "bad" = "ok";
    mockTauri((command, args) => {
      if (command === "search_items") {
        queries.push((args as { query: SearchQuery }).query);
        if (mode === "bad") {
          throw { code: "invalid_regex", message: "regex parse error:\n    [unclosed" };
        }
        return { items: [item], total: 1, limit: 20, offset: 0 };
      }
      return undefined;
    });

    const view = render(<SearchResultsPage query="deploy" />);
    expect(await screen.findByRole("heading", { name: "Deploy API" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Regex" }));
    mode = "bad";
    // The query prop is owned by the parent; emulate the user editing it
    // by rerendering with a broken pattern.
    view.rerender(<SearchResultsPage query="[unclosed" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Invalid regex");
    // The previously rendered result row is still on the page.
    expect(screen.getByRole("heading", { name: "Deploy API" })).toBeDefined();
    // Dismiss clears the error and returns to Literal mode.
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "Literal" }).getAttribute("aria-pressed")).toBe("true");
  });
});

afterEach(() => {
  resetClipboardStore();
});
