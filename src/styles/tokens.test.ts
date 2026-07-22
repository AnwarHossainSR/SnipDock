import { expect, test } from "bun:test";

test("themes and fonts are fully local", async () => {
  const [tokens, fonts, theme, index] = await Promise.all([
    Bun.file("src/styles/tokens.css").text(),
    Bun.file("src/styles/fonts.css").text(),
    Bun.file("src/styles/theme.css").text(),
    Bun.file("src/styles/index.css").text(),
  ]);

  expect(tokens).toContain(':root[data-theme="light"]');
  expect(tokens).toContain(':root[data-theme="dark"]');
  expect(tokens).toContain("--font-display");
  expect(fonts).toContain("../assets/fonts/PlusJakartaSans-Variable.woff2");
  expect(fonts).toContain("../assets/fonts/Inter-Variable.woff2");
  expect(fonts).toContain("../assets/fonts/JetBrainsMono-Variable.woff2");
  expect(theme).toContain('@import "tailwindcss/preflight.css" layer(base)');
  expect(index).toContain('@import "./fonts.css"');
  expect(index).not.toMatch(/features\/|primitives\.css|shell\.css|theme-pro\.css/);
  expect(`${tokens}\n${fonts}\n${theme}\n${index}`).not.toMatch(/https?:|fonts\.googleapis|fonts\.gstatic/);
});
