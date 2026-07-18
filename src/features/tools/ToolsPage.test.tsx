import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import ToolsPage from "./ToolsPage";

test("ToolsPage searches tools and runs the selected tool", async () => {
  let call: { command: string; args: unknown } | undefined;
  mockTauri((command, args) => {
    call = { command, args };
    return { output: [{ match: "ABC", groups: [] }], warnings: [] };
  });
  render(<ToolsPage />);

  fireEvent.change(screen.getByLabelText("Search tools"), {
    target: { value: "regex" },
  });
  fireEvent.click(screen.getByRole("option", { name: "Regex tester" }));
  fireEvent.change(screen.getByLabelText("Pattern"), { target: { value: "[A-Z]+" } });
  fireEvent.change(screen.getByLabelText("Input"), { target: { value: "ABC 123" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));

  await screen.findByText(/ABC/);
  expect(call).toEqual({
    command: "run_tool",
    args: { input: { tool: "regex", input: { text: "ABC 123", pattern: "[A-Z]+" } } },
  });
});
