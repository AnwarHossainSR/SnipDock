import { describe, expect, test } from "bun:test";

const root = new URL("../../site/", import.meta.url);

describe("GitHub Pages site", () => {
  test("contains semantic product content and canonical actions", async () => {
    const html = await Bun.file(new URL("index.html", root)).text();

    expect(html).toContain("<main");
    expect(html).toContain("Clipboard,");
    expect(html).toContain("organized. Locally.");
    expect(html).toContain(
      'href="https://github.com/AnwarHossainSR/SnipDock/releases/latest"',
    );
    expect(html).toContain(
      'href="https://github.com/AnwarHossainSR/SnipDock"',
    );
    expect(html).toContain('href="styles.css"');
    expect(html).toContain('src="icon.png"');
    expect(html).not.toMatch(/(?:href|src)="\/(?!\/)/);
  });

  test("keeps accessibility and responsive safeguards", async () => {
    const css = await Bun.file(new URL("styles.css", root)).text();

    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("@media (max-width:");
    expect(await Bun.file(new URL("icon.png", root)).exists()).toBe(true);
    for (const font of [
      "PlusJakartaSans-Variable.woff2",
      "Inter-Variable.woff2",
      "JetBrainsMono-Variable.woff2",
    ]) {
      expect(await Bun.file(new URL(`fonts/${font}`, root)).exists()).toBe(true);
    }
  });
});
