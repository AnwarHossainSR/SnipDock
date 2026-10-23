import { render, screen, within } from "@testing-library/react";
import { expect, test } from "bun:test";
import ChangelogView from "./ChangelogView";

/**
 * Release notes are CHANGELOG.md sections, whose items lead with a bold phrase
 * and name settings and files in code spans. Shown as typed, the markers read
 * as noise in the update prompt.
 */
test("renders bold lead-ins and inline code instead of their markers", () => {
  render(<ChangelogView notes={"### Added\n\n- **Env page.** Copy a set out as `.env` or JSON."} />);

  const item = screen.getByRole("listitem");
  expect(item.textContent).toBe("Env page. Copy a set out as .env or JSON.");
  expect(within(item).getByText("Env page.").tagName).toBe("STRONG");
  expect(within(item).getByText(".env").tagName).toBe("CODE");
});
