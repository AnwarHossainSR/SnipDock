import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import AiSettings from "./AiSettings";
import SecurityPanel from "./SecurityPanel";
import SyncSettings from "./SyncSettings";

describe("Security and extension settings", () => {
  test("SecurityPanel locks and unlocks through security commands", async () => {
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      return { unlocked: true, retry_after_seconds: null };
    });
    render(<SecurityPanel />);

    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText("App unlocked.");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    await screen.findByText("App locked.");

    expect(calls).toEqual(["unlock_app", "lock_app"]);
  });

  test("AiSettings stays explicit about per-request consent", () => {
    render(<AiSettings />);

    fireEvent.click(screen.getByLabelText("Enable per-request AI review"));

    expect(screen.getByText(/outbound content/)).toBeTruthy();
  });

  test("SyncSettings shows disabled local sync status", async () => {
    mockTauri(() => ({
      enabled: false,
      device_id: "device-123456",
      pending: 0,
      conflicts: [],
    }));
    render(<SyncSettings />);

    await screen.findByText("Sync is off. No network requests are made.");
    expect(screen.getByText("device-1")).toBeTruthy();
  });
});
