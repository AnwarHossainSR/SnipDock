import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import SearchModeToggle from "./SearchModeToggle";

describe("SearchModeToggle", () => {
  it("renders both modes and marks the active one with aria-pressed", () => {
    render(<SearchModeToggle value="literal" onChange={() => {}} />);
    const literal = screen.getByRole("button", { name: "Literal" });
    const regex = screen.getByRole("button", { name: "Regex" });
    expect(literal.getAttribute("aria-pressed")).toBe("true");
    expect(regex.getAttribute("aria-pressed")).toBe("false");
  });

  it("emits the next value on click", () => {
    let captured = "literal";
    render(<SearchModeToggle value="literal" onChange={(next) => (captured = next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Regex" }));
    expect(captured).toBe("regex");
  });

  it("disables both buttons when disabled", () => {
    render(<SearchModeToggle value="regex" onChange={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Literal" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Regex" }).hasAttribute("disabled")).toBe(true);
  });
});
