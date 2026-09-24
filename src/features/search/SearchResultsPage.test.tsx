import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";
import type { LibraryItem, SearchQuery } from "../../api/types";
import { mockTauri } from "../../test/setup";
import SearchResultsPage from "./SearchResultsPage";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";

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

  // The results and the history are the same rows seen from two pages. A flag
  // set here used to patch only this page's local copy, so clearing the search
  // put the row back on screen with the state it had before the click.
  it("pins through to the clipboard store", async () => {
    const pinned = { ...item, pinned: true };
    mockTauri((command) => {
      if (command === "search_items") return { items: [item], total: 1, limit: 20, offset: 0 };
      if (command === "set_item_flags") return pinned;
    });
    useClipboardStore.setState({ items: [item], groupedItems: [], total: 1 });
    render(<SearchResultsPage query="deploy" />);

    fireEvent.click(await screen.findByRole("button", { name: "Pin item" }));

    await waitFor(() =>
      expect(useClipboardStore.getState().items[0].pinned).toBe(true),
    );
    expect(await screen.findByRole("button", { name: "Unpin item" })).toBeDefined();
  });

  // This control was an anchor to #clipboard, and the results stayed mounted
  // over the destination it pointed at, so clicking it did nothing visible.
  it("asks the history to reveal the row", async () => {
    mockTauri((command) => {
      if (command === "search_items") return { items: [item], total: 1, limit: 20, offset: 0 };
    });
    render(<SearchResultsPage query="deploy" />);

    fireEvent.click(await screen.findByRole("button", { name: "Show in history" }));

    await waitFor(() =>
      expect(useClipboardStore.getState().focusRequest?.id).toBe("result-1"),
    );
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

  // Captures have no title, so every result used to be headed by its kind:
  // "CLIPBOARD" over "clipboard", on every card. A result is headed by what
  // it holds.
  it("heads an untitled capture with its own text, not its kind", async () => {
    const capture = { ...item, id: "result-2", title: null, content: "kubectl rollout status deploy/api" };
    mockTauri((command) => {
      if (command === "search_items") return { items: [capture], total: 1, limit: 20, offset: 0 };
    });
    render(<SearchResultsPage query="rollout" />);

    expect(await screen.findByRole("heading", { name: "kubectl rollout status deploy/api" })).toBeDefined();
    expect(screen.queryAllByRole("heading", { name: "clipboard" }).length).toBe(0);
    expect(screen.queryAllByText("clipboard").length).toBe(0);
  });

  // Seeing why a row matched is what makes a result list trustworthy, and a
  // match below the preview's two lines used to leave nothing to see.
  it("shows and marks the line that matched", async () => {
    const changelog = { ...item, id: "result-3", title: null, content_type: "markdown", content: "## 2.4.0\n- Faster startup\n- Smaller installer\n- Faster order search" };
    mockTauri((command) => {
      if (command === "search_items") return { items: [changelog], total: 1, limit: 20, offset: 0 };
    });
    render(<SearchResultsPage query="order type:markdown" />);

    const heading = await screen.findByRole("heading", { name: /Faster order search/ });
    const marks = Array.from(heading.querySelectorAll("mark")).map((node) => node.textContent);
    // The operator is not a term, so only the word is marked.
    expect(marks).toEqual(["order"]);
  });

  it("marks nothing for a regex query", async () => {
    mockTauri((command) => {
      if (command === "search_items") return { items: [item], total: 1, limit: 20, offset: 0 };
    });
    useClipboardStore.setState({ searchMode: "regex" });
    render(<SearchResultsPage query="deploy" />);

    await screen.findByRole("heading", { name: "Deploy API" });
    expect(document.querySelectorAll("mark").length).toBe(0);
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
