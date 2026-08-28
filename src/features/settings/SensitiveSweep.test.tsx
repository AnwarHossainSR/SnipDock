import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockTauri } from "../../test/setup";
import SensitiveSweep from "./SensitiveSweep";

describe("SensitiveSweep", () => {
  test("sweeps everything by default and offers to undo what it took", async () => {
    const calls: { command: string; args?: InvokeArgs }[] = [];
    mockTauri((command, args?: InvokeArgs) => {
      calls.push({ command, args });
      if (command === "clear_sensitive_data") {
        return {
          cleared_count: 4,
          cleared_ids: ["a", "b", "c", "d"],
          receipt_id: "receipt-1",
          expires_at: "2026-08-28T00:00:30.000Z",
        };
      }
      return undefined;
    });
    render(<SensitiveSweep />);

    fireEvent.click(screen.getByRole("button", { name: "Clear now" }));

    expect(await screen.findByText(/4 captures cleared/)).toBeDefined();
    expect(calls[0]).toEqual({ command: "clear_sensitive_data", args: { maxAgeMinutes: 0 } });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByText("Put back.")).toBeDefined());
    expect(calls.some((call) => call.command === "restore_item")).toBe(true);
  });

  test("passes the chosen age through as minutes", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args?: InvokeArgs) => {
      if (command === "clear_sensitive_data") {
        received = args;
        return { cleared_count: 0, cleared_ids: [], receipt_id: null, expires_at: null };
      }
      return undefined;
    });
    render(<SensitiveSweep />);

    fireEvent.click(screen.getByRole("radio", { name: "Older than a day" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear now" }));

    await waitFor(() => expect(received).toEqual({ maxAgeMinutes: 1440 }));
  });

  test("offers no undo when the sweep found nothing", async () => {
    mockTauri((command) =>
      command === "clear_sensitive_data"
        ? { cleared_count: 0, cleared_ids: [], receipt_id: null, expires_at: null }
        : undefined,
    );
    render(<SensitiveSweep />);

    fireEvent.click(screen.getByRole("button", { name: "Clear now" }));

    expect(await screen.findByText("Nothing matched.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  test("says the window has closed rather than silently failing the undo", async () => {
    mockTauri((command) => {
      if (command === "clear_sensitive_data") {
        return { cleared_count: 1, cleared_ids: ["a"], receipt_id: "receipt-1", expires_at: "x" };
      }
      if (command === "restore_item") throw new Error("not found");
      return undefined;
    });
    render(<SensitiveSweep />);

    fireEvent.click(screen.getByRole("button", { name: "Clear now" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That sweep can no longer be undone.",
    );
  });
});
