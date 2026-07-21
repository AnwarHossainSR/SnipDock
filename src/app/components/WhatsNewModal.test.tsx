import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import WhatsNewModal from "./WhatsNewModal";

const note = { version: "0.2.0", highlights: ["First thing", "Second thing"] };

test("shows the version and highlights and closes on Got it", () => {
  let closed = false;
  render(<WhatsNewModal note={note} onClose={() => { closed = true; }} />);

  expect(screen.getByRole("dialog", { name: "Updated to SnipDock v0.2.0" })).toBeDefined();
  expect(screen.getByText("First thing")).toBeDefined();
  expect(screen.getByText("Second thing")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(closed).toBe(true);
});

test("closes on Escape", () => {
  let closed = false;
  render(<WhatsNewModal note={note} onClose={() => { closed = true; }} />);

  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(closed).toBe(true);
});
