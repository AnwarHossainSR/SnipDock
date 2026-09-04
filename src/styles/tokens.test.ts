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
