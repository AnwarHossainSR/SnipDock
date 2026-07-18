import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import type { LibraryItem } from "../../api/types";
import AiActions from "./AiActions";

const item: LibraryItem = {
  id: "snippet-1",
  kind: "snippet",
  title: "Deploy",
  description: null,
  content: "bun run deploy",
  notes: null,
  content_type: "shell",
  language: "shell",
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
  created_at: "2026-07-18T00:00:00Z",
  updated_at: "2026-07-18T00:00:00Z",
};

describe("AiActions", () => {
  test("requires outbound-content consent before running", async () => {
    let call: { command: string; args: unknown } | undefined;
    mockTauri((command, args) => {
      call = { command, args };
      return { output: "explanation", warnings: [] };
    });
    render(<AiActions item={item} onSave={() => {}} />);

    expect((screen.getByRole("button", { name: "Run review" }) as HTMLButtonElement).disabled)
      .toBe(true);
    fireEvent.click(screen.getByLabelText("I reviewed outbound content"));
    fireEvent.click(screen.getByRole("button", { name: "Run review" }));

    await screen.findByText("explanation");
    expect(call).toEqual({
      command: "run_ai_action",
      args: {
        input: {
          action: "explain",
          content: "bun run deploy",
          consent: true,
        },
      },
    });
  });

  test("refuses private items before calling AI", async () => {
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      return { output: "", warnings: [] };
    });
    render(<AiActions item={{ ...item, private: true }} onSave={() => {}} />);

    fireEvent.click(screen.getByLabelText("I reviewed outbound content"));
    fireEvent.click(screen.getByRole("button", { name: "Run review" }));

    await screen.findByText("Private items cannot use AI actions.");
    expect(calls).toEqual([]);
  });
});
