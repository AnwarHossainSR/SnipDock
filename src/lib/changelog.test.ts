import { describe, expect, it } from "bun:test";
import { parseChangelog, getCategoryColor } from "./changelog";

describe("parseChangelog", () => {
  it("returns no content for null input", () => {
    const result = parseChangelog(null);
    expect(result.hasContent).toBe(false);
    expect(result.sections).toHaveLength(0);
  });

  it("returns no content for empty string", () => {
    const result = parseChangelog("");
    expect(result.hasContent).toBe(false);
    expect(result.sections).toHaveLength(0);
  });

  it("parses structured changelog with multiple sections", () => {
    const notes = `### Added

- sort query results by clicking a column header
- add big list of features section to landing page

### Fixed

- widen connect panel so footer actions fit one row`;

    const result = parseChangelog(notes);
    expect(result.hasContent).toBe(true);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].category).toBe("Added");
    expect(result.sections[0].items).toHaveLength(2);
    expect(result.sections[0].items[0]).toBe("sort query results by clicking a column header");
    expect(result.sections[1].category).toBe("Fixed");
    expect(result.sections[1].items).toHaveLength(1);
  });

  it("falls back to plain text when no section headers exist", () => {
    const notes = "Fixes and improvements";
    const result = parseChangelog(notes);
    expect(result.hasContent).toBe(true);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].category).toBe("Changes");
    expect(result.sections[0].items[0]).toBe("Fixes and improvements");
  });

  it("handles multi-line plain text notes", () => {
    const notes = "Line one\nLine two\nLine three";
    const result = parseChangelog(notes);
    expect(result.hasContent).toBe(true);
    expect(result.sections[0].items).toHaveLength(3);
  });

  it("ignores items outside of a section", () => {
    const notes = `- orphan item
### Added
- valid item`;
    const result = parseChangelog(notes);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].items).toEqual(["valid item"]);
  });

  it("handles items with asterisk bullets", () => {
    const notes = "### Fixed\n* fix one\n* fix two";
    const result = parseChangelog(notes);
    expect(result.sections[0].items).toEqual(["fix one", "fix two"]);
  });

  it("trims whitespace from items", () => {
    const notes = "### Added\n-   spaced item   ";
    const result = parseChangelog(notes);
    expect(result.sections[0].items[0]).toBe("spaced item");
  });

  it("collects multiple items under one section", () => {
    const notes = `### Changed
- one
- two
- three
- four
- five`;
    const result = parseChangelog(notes);
    expect(result.sections[0].items).toHaveLength(5);
  });

  it("sorts sections in preferred order", () => {
    const notes = `### Removed
- old feature
### Fixed
- bug fix
### Added
- new feature`;
    const result = parseChangelog(notes);
    expect(result.sections.map((s) => s.category)).toEqual(["Added", "Fixed", "Removed"]);
  });
});

describe("getCategoryColor", () => {
  it("returns emerald for Added", () => {
    expect(getCategoryColor("Added")).toContain("emerald");
  });

  it("returns sky for Fixed", () => {
    expect(getCategoryColor("Fixed")).toContain("sky");
  });

  it("returns amber for Changed", () => {
    expect(getCategoryColor("Changed")).toContain("amber");
  });

  it("returns rose for Removed", () => {
    expect(getCategoryColor("Removed")).toContain("rose");
  });

  it("is case-insensitive", () => {
    expect(getCategoryColor("added")).toContain("emerald");
    expect(getCategoryColor("FIXED")).toContain("sky");
  });

  it("returns muted for unknown categories", () => {
    expect(getCategoryColor("Other")).toContain("muted-foreground");
  });
});
