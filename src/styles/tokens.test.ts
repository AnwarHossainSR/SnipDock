import { expect, test } from "bun:test";
import { ACCENTS } from "../lib/theme";

const RAMP = ["--accent", "--accent-hover", "--accent-subtle", "--accent-ink", "--accent-on"];

/** The declarations inside one `{ ... }` block, given the selector that opens it. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return "";
  return css.slice(at, css.indexOf("}", at));
}

test("themes and fonts are fully local", async () => {
  const [tokens, fonts, theme, index] = await Promise.all([
    Bun.file("src/styles/tokens.css").text(),
    Bun.file("src/styles/fonts.css").text(),
    Bun.file("src/styles/theme.css").text(),
    Bun.file("src/styles/index.css").text(),
  ]);

  expect(tokens).toContain("--font-display");
  expect(fonts).toContain("../assets/fonts/PlusJakartaSans-Variable.woff2");
  expect(fonts).toContain("../assets/fonts/Inter-Variable.woff2");
  expect(fonts).toContain("../assets/fonts/JetBrainsMono-Variable.woff2");
  expect(theme).toContain('@import "tailwindcss/preflight.css" layer(base)');
  expect(index).toContain('@import "./fonts.css"');
  expect(index).not.toMatch(/features\/|primitives\.css|shell\.css|theme-pro\.css/);
  expect(`${tokens}\n${fonts}\n${theme}\n${index}`).not.toMatch(/https?:|fonts\.googleapis|fonts\.gstatic/);
});

// The interface carries state in tinted surfaces and quiet borders, and both
// are the first things high-contrast and forced-colour modes take away. Without
// these blocks a selected row, a pressed filter pill and the focus ring are all
// indistinguishable from their resting state.
test("state survives high contrast and forced colours", async () => {
  const a11y = await Bun.file("src/styles/a11y.css").text();

  expect(a11y).toContain("@media (prefers-contrast: more)");
  expect(a11y).toContain("@media (forced-colors: active)");
  // System keywords are the only colours forced-colors honours.
  expect(a11y).toMatch(/background-color:\s*Highlight/);
  expect(a11y).toMatch(/outline:\s*3px solid Highlight/);
  expect(a11y).toContain('[aria-pressed="true"]');
  expect(a11y).toContain('[aria-selected="true"]');
});

// base.css used to be unlayered, and unlayered CSS beats every layer: its
// :focus-visible outline overrode every outline-none in the app (a second
// focus ring on anything that drew its own), and `button { font: inherit }`
// overrode the text size, weight and family of 191 of 312 controls measured.
// It now sits in the base layer, where component utilities can win. The
// accessibility overrides are the one thing that must keep beating them, so
// they stay unlayered - and must be imported after base.css.
test("base styles are layered, and only the accessibility overrides are not", async () => {
  const index = await Bun.file("src/styles/index.css").text();
  const base = await Bun.file("src/styles/base.css").text();

  expect(index).toMatch(/@import\s+"\.\/base\.css"\s+layer\(base\)/);
  expect(index).toMatch(/@import\s+"\.\/a11y\.css";/);
  expect(index.indexOf("a11y.css")).toBeGreaterThan(index.indexOf("base.css"));
  // Anything that must win over components belongs in a11y.css instead.
  expect(base).not.toContain("forced-colors");
  expect(base).not.toContain("prefers-contrast");
});

// The display face ships a word space of about 0.13em, half of Inter's. At
// 14px that measured 2px and the inspector heading read "JSONcapture".
test("the display face widens its word space wherever it is applied", async () => {
  const base = await Bun.file("src/styles/base.css").text();

  expect(block(base, ".font-display")).toContain("word-spacing:");
  expect(block(base, "h1,\nh2,\nh3")).toContain("word-spacing:");
});

test("every accent defines the whole five-token ramp in both modes", async () => {
  const tokens = await Bun.file("src/styles/tokens.css").text();

  for (const { id } of ACCENTS) {
    const light = block(tokens, `[data-accent="${id}"]`);
    const dark = block(tokens, `:root[data-mode="dark"] [data-accent="${id}"]`);
    for (const name of RAMP) {
      // A ramp missing one rung is the failure that ships unreadable text: the
      // token falls back to another theme's value rather than erroring.
      expect(light, `${id} light is missing ${name}`).toContain(`${name}:`);
      expect(dark, `${id} dark is missing ${name}`).toContain(`${name}:`);
    }
  }
});

test("neutrals and semantic roles are never accent-derived", async () => {
  const tokens = await Bun.file("src/styles/tokens.css").text();

  // Layer 2 and Layer 3 are what stay put while the accent changes. If either
  // ever reads var(--accent*), picking plum would restyle "delete" or repaint
  // every surface, which is the coupling this whole split exists to prevent.
  const neutrals = ["--page", "--surface-1", "--surface-2", "--border", "--text-primary", "--text-secondary", "--text-muted"];
  const roles = ["--success", "--danger", "--warning"];
  for (const name of [...neutrals, ...roles]) {
    const declarations = tokens.match(new RegExp(`${name}:[^;]+;`, "g")) ?? [];
    expect(declarations.length, `${name} is never defined`).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration, `${name} is accent-derived`).not.toContain("--accent");
    }
  }
});

test("colour literals live only in tokens.css", async () => {
  const files = new Bun.Glob("src/**/*.{ts,tsx,css}").scanSync(".");
  const offenders: string[] = [];

  for (const path of files) {
    if (path.replace(/\\/g, "/").endsWith("src/styles/tokens.css")) continue;
    if (path.includes(".test.")) continue;
    const source = await Bun.file(path).text();
    for (const [index, line] of source.split("\n").entries()) {
      // Tag colours are user data, not theme chrome, and shadow/scrim alphas
      // are neutral blacks and whites rather than palette values.
      if (line.includes("TAG_COLORS") || /rgba?\((?:0 0 0|255 255 255|20 24 28)/.test(line)) continue;
      if (/#[0-9a-fA-F]{3,8}\b|\bhsla?\(|\brgba?\(/.test(line)) {
        offenders.push(`${path}:${index + 1}: ${line.trim()}`);
      }
    }
  }

  expect(offenders).toEqual([]);
});

test("settings form controls are restyled from tokens in both themes", async () => {
  const base = await Bun.file("src/styles/base.css").text();
  const controls = base.slice(base.indexOf(".settings-form"));

  // Native elements, custom painting: appearance is replaced, semantics are not.
  expect(controls).toContain('.settings-form input[type="checkbox"]');
  expect(controls).toContain(".settings-form select");
  expect(controls).toMatch(/appearance:\s*none/);
  expect(controls).toContain(".settings-form fieldset legend");
  expect(controls).toContain("outline: 2px solid var(--accent)");

  // Colors come from tokens, which is what makes light and dark both work.
  expect(controls).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});
