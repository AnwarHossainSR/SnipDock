import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import TemplateEditor from "./TemplateEditor";

test("renders editor, values, and preview with one primary action per panel", async () => {
  mockTauri((command, args) => {
    if (command === "render_template") {
      const template = (args as { input: { template: string } }).input.template;
      return template.includes("{{name}}")
        ? { output: null, missing: ["name"], diagnostics: [] }
        : { output: template, missing: [], diagnostics: [] };
    }
    return {};
  });
  render(<TemplateEditor />);

  expect(screen.getByRole("heading", { name: "Template workspace" })).toBeDefined();
  fireEvent.change(screen.getByLabelText("Template"), { target: { value: "Hello {{name}}" } });
  expect(await screen.findByLabelText("name")).toBeDefined();
  expect(screen.getByText("Needs values")).toBeDefined();
  expect((screen.getByRole("button", { name: "Copy rendered" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Save template" })).toBeDefined();
});
