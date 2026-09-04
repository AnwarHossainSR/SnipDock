import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  applyTheme,
  cacheTheme,
  isAccent,
  isMode,
  readCachedTheme,
  resolveMode,
} from "./theme";

const originalMatchMedia = globalThis.window?.matchMedia;

function stubSystemMode(dark: boolean) {
  // @ts-expect-error - a minimal stand-in for the one property under test.
  globalThis.window.matchMedia = () => ({
    matches: dark,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.removeAttribute("data-accent");
});

afterEach(() => {
  if (originalMatchMedia) globalThis.window.matchMedia = originalMatchMedia;
});

test("applying a theme writes both attributes together", () => {
  applyTheme("plum", "dark");
  expect(document.documentElement.dataset.accent).toBe("plum");
  expect(document.documentElement.dataset.mode).toBe("dark");

  // Switching accent must not disturb the mode, or the app would end up on one
  // theme's accent over another theme's neutrals.
  applyTheme("clay", "dark");
  expect(document.documentElement.dataset.accent).toBe("clay");
  expect(document.documentElement.dataset.mode).toBe("dark");
});

test("system mode resolves to the OS preference, never to the literal word", () => {
  stubSystemMode(true);
  expect(resolveMode("system")).toBe("dark");
  applyTheme("teal", "system");
  // The attribute is always concrete: no CSS anywhere matches [data-mode=system].
  expect(document.documentElement.dataset.mode).toBe("dark");

  stubSystemMode(false);
  expect(resolveMode("system")).toBe("light");

  // An explicit choice is not overridden by the OS.
  expect(resolveMode("dark")).toBe("dark");
});

test("the pre-paint mirror round-trips, and rejects junk", () => {
  cacheTheme("indigo", "dark");
  expect(readCachedTheme()).toEqual({ accent: "indigo", mode: "dark" });

  // A stale or hand-edited value must not paint an undefined ramp.
  localStorage.setItem("snipdock.accent", "chartreuse");
  localStorage.setItem("snipdock.mode", "sepia");
  expect(readCachedTheme()).toEqual({ accent: DEFAULT_ACCENT, mode: DEFAULT_MODE });
});

test("nothing is cached before a first choice, so the mirror falls back cleanly", () => {
  expect(readCachedTheme()).toEqual({ accent: DEFAULT_ACCENT, mode: DEFAULT_MODE });
});

test("guards accept exactly the six accents and three modes", () => {
  for (const { id } of ACCENTS) expect(isAccent(id)).toBe(true);
  expect(ACCENTS).toHaveLength(6);
  expect(isAccent("chartreuse")).toBe(false);
  expect(isAccent(null)).toBe(false);

  for (const mode of ["light", "dark", "system"]) expect(isMode(mode)).toBe(true);
  expect(isMode("sepia")).toBe(false);
});

test("the picker and the stylesheet list the same accents", async () => {
  const tokens = await Bun.file("src/styles/tokens.css").text();
  // Adding a ramp without adding a picker entry ships a theme nobody can
  // select; the reverse ships a button that paints nothing.
  const inCss = new Set([...tokens.matchAll(/\[data-accent="([a-z]+)"\]/g)].map((m) => m[1]));
  expect([...inCss].sort()).toEqual(ACCENTS.map((a) => a.id).sort());
});
