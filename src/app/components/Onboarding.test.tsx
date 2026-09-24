import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockTauri } from "../../test/setup";
import App from "../App";
import Onboarding from "./Onboarding";

test("walks three steps and records completion once", async () => {
  const saved: InvokeArgs[] = [];
  mockTauri((command, args) => {
    if (command === "save_settings") {
      saved.push(args as InvokeArgs);
      return {};
    }
    return undefined;
  });
  let done = 0;
  render(<Onboarding onDone={() => (done += 1)} />);

  expect(screen.getByText("Everything you copy lands here")).toBeDefined();
  expect(screen.getByText("Step 1 of 3")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Paste without leaving the keyboard")).toBeDefined();
  // Quick Paste cannot be discovered from inside this window, so the step that
  // introduces it has to name the key.
  expect(screen.getByText("Ctrl + Shift + V")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Some things are better not recorded")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Start using SnipDock" }));

  expect(done).toBe(1);
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(JSON.stringify(saved[0])).toContain("onboarding_completed");
});

test("names the rebound Quick Paste shortcut", () => {
  mockTauri(() => undefined);
  render(
    <Onboarding
      shortcutOverrides={{ open_quick_paste: "CmdOrCtrl+Alt+V" }}
      onDone={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Next" }));

  expect(screen.getByText("Ctrl + Alt + V")).toBeDefined();
  expect(screen.queryByText("Ctrl + Shift + V")).toBeNull();
});

test("Escape skips it, and skipping still records completion", async () => {
  const saved: InvokeArgs[] = [];
  mockTauri((command, args) => {
    if (command === "save_settings") {
      saved.push(args as InvokeArgs);
      return {};
    }
    return undefined;
  });
  let done = 0;
  render(<Onboarding onDone={() => (done += 1)} />);

  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

  expect(done).toBe(1);
  await waitFor(() => expect(saved).toHaveLength(1));
});

// The introduction interrupts a launch, so it runs only when the backend has
// positively said it has not been seen. Anything else - a settings read that
// failed, or a blob without the flag - leaves the launch alone.
test("App shows it only when settings say it has not been seen", async () => {
  mockTauri((command) => {
    if (command === "get_settings") {
      return { clipboard_tracking: true, onboarding_completed: false };
    }
    if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
    return undefined;
  });
  render(<App />);

  expect(await screen.findByRole("dialog", { name: "Everything you copy lands here" })).toBeDefined();
});

test("App does not interrupt a launch when the flag is already set", async () => {
  mockTauri((command) => {
    if (command === "get_settings") {
      return { clipboard_tracking: true, onboarding_completed: true };
    }
    if (command === "search_items") return { items: [], total: 0, limit: 100, offset: 0 };
    return undefined;
  });
  render(<App />);

  expect(await screen.findByText("Your clipboard is quiet")).toBeDefined();
  expect(screen.queryByRole("dialog")).toBeNull();
});
