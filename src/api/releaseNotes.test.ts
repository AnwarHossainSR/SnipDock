import { describe, expect, it } from "bun:test";
import { releaseNotesFor, whatsNewToShow } from "./releaseNotes";

describe("releaseNotesFor", () => {
  it("returns curated highlights for a known version", () => {
    const note = releaseNotesFor("0.1.3");
    expect(note?.version).toBe("0.1.3");
    expect(note?.highlights.length).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown version", () => {
    expect(releaseNotesFor("9.9.9")).toBeUndefined();
  });
});

describe("whatsNewToShow", () => {
  it("shows nothing on a first-ever run", () => {
    expect(whatsNewToShow("0.1.0", null)).toBeNull();
  });

  it("shows nothing when the version is unchanged", () => {
    expect(whatsNewToShow("0.1.0", "0.1.0")).toBeNull();
  });

  it("shows the note when the version changed and has highlights", () => {
    expect(whatsNewToShow("0.1.3", "0.1.2")?.version).toBe("0.1.3");
  });

  it("shows nothing when the new version has no curated highlights", () => {
    expect(whatsNewToShow("9.9.9", "0.1.0")).toBeNull();
  });
});
