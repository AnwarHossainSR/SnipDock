import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import App from "./App";

describe("App", () => {
  it("renders the application name", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "SnipDock" })).toBeDefined();
  });
});
