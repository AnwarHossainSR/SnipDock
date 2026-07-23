import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "bun:test";
import { emit } from "@tauri-apps/api/event";
import { mockTauri } from "../../test/setup";
import AppSidebar from "./AppSidebar";

beforeEach(() => localStorage.clear());

test("shows current version and installs an available update on request", async () => {
  const calls: string[] = [];
  mockTauri((command) => {
    calls.push(command);
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") return { version: "0.2.0", notes: "Fixes and improvements", date: null };
    if (command === "install_update") return true;
  });

  render(<AppSidebar />);

  expect(screen.getByRole("link", { name: "Anwar Hossain" }).getAttribute("href"))
    .toBe("https://github.com/AnwarHossainSR");
  expect(await screen.findByText("v0.1.0")).toBeDefined();
  fireEvent.click(await screen.findByRole("button", { name: "Download & install" }));
  await waitFor(() => expect(calls).toContain("install_update"));
});

test("offers an available update on launch and defers it until next launch", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: "Fixes and improvements", date: "2026-07-23" };
    }
  });

  const firstLaunch = render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
  expect(screen.getByText("Fixes and improvements")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeDefined();

  firstLaunch.unmount();
  render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("skips only the selected update version", async () => {
  let offered = "0.2.0";
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") return { version: offered, notes: null, date: null };
  });

  const firstLaunch = render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Skip this version" }));
  firstLaunch.unmount();

  const skippedLaunch = render(<AppSidebar />);
  await screen.findByRole("button", { name: "Update to v0.2.0" });
  expect(screen.queryByRole("dialog")).toBeNull();
  skippedLaunch.unmount();

  offered = "0.3.0";
  render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("keeps the update modal open when installation fails", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: null, date: null };
    }
    if (command === "install_update") throw new Error("network unavailable");
  });

  render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Download & install" }));

  expect((await screen.findByRole("alert")).textContent).toContain("Update could not be installed");
  expect(screen.getByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("waits to check for updates until a hidden app is opened", async () => {
  const calls: string[] = [];
  mockTauri((command) => {
    calls.push(command);
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return false;
  });

  render(<AppSidebar />);
  await screen.findByText("v0.1.0");

  expect(calls).not.toContain("check_for_update");

  await emit("shortcut://search");

  await waitFor(() => expect(calls).toContain("check_for_update"));
});

test("close control defers the update for the current launch", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: null, date: null };
    }
  });

  render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Close update dialog" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeDefined();
});
