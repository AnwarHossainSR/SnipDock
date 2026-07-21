import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import AppSidebar from "./AppSidebar";

test("shows current version and installs an available update on request", async () => {
  const calls: string[] = [];
  mockTauri((command) => {
    calls.push(command);
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "check_for_update") return "0.2.0";
    if (command === "install_update") return true;
  });

  render(<AppSidebar />);

  expect(await screen.findByText("v0.1.0")).toBeDefined();
  fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));
  await waitFor(() => expect(calls).toContain("install_update"));
});
