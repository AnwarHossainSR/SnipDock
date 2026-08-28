import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import AnalyticsPanel from "./AnalyticsPanel";

const analytics = {
  total_items: 240,
  total_copies: 600,
  items_by_type: [],
  items_by_content_type: [
    { content_type: "plain_text", count: 180 },
    { content_type: "image", count: 60 },
    { content_type: "json", count: 0 },
  ],
  most_used_items: [
    {
      id: "a",
      title: "deploy token",
      content_type: "plain_text",
      usage_count: 42,
      last_used_at: "2026-08-20T10:00:00.000Z",
    },
  ],
  recent_activity: [],
  storage_used_bytes: 2_097_152,
};

describe("AnalyticsPanel", () => {
  test("counts captures, copies, and stored text", async () => {
    mockTauri((command) => (command === "get_analytics" ? analytics : undefined));
    render(<AnalyticsPanel />);

    expect(await screen.findByText("240")).toBeDefined();
    expect(screen.getByText("600")).toBeDefined();
    expect(screen.getByText("2.0 MB")).toBeDefined();
    expect(screen.getByText("2.5 per capture")).toBeDefined();
  });

  test("breaks the history down by type and leaves empty types out", async () => {
    mockTauri((command) => (command === "get_analytics" ? analytics : undefined));
    render(<AnalyticsPanel />);

    expect(await screen.findByText("Plain text")).toBeDefined();
    expect(screen.getByText("Images")).toBeDefined();
    // A type nothing was captured as would only be a zero-length bar.
    expect(screen.queryByText("JSON")).toBeNull();
  });

  test("names the most-copied captures with their counts", async () => {
    mockTauri((command) => (command === "get_analytics" ? analytics : undefined));
    render(<AnalyticsPanel />);

    expect(await screen.findByText("deploy token")).toBeDefined();
    expect(screen.getByText(/42×/)).toBeDefined();
  });

  test("says the history is empty rather than drawing empty bars", async () => {
    mockTauri((command) =>
      command === "get_analytics"
        ? { ...analytics, total_items: 0, total_copies: 0, items_by_content_type: [], most_used_items: [] }
        : undefined,
    );
    render(<AnalyticsPanel />);

    expect(
      await screen.findByText("Nothing captured yet, so there is nothing to count."),
    ).toBeDefined();
  });

  test("reports a failure to read usage", async () => {
    mockTauri((command) => {
      if (command === "get_analytics") throw new Error("database is locked");
      return undefined;
    });
    render(<AnalyticsPanel />);

    expect((await screen.findByRole("alert")).textContent).toBe("database is locked");
  });
});
