import { describe, expect, test } from "bun:test";

/**
 * The bundler takes what `bundle.icon` lists and nothing else. The repository
 * shipped only `icon.ico` and `icon.png` while the release workflow built
 * macOS `app`/`dmg` and Linux `deb`/`appimage`, so those bundles carried a
 * default icon - invisible to anyone building on Windows, and invisible to CI,
 * which never opens the result.
 */
describe("bundle icons", () => {
  const config = Bun.file("src-tauri/tauri.conf.json").json() as Promise<{
    bundle: { icon: string[] };
  }>;

  test("lists every format the desktop bundlers need", async () => {
    const { icon } = (await config).bundle;

    // .icns is the one macOS reads; .ico is Windows; the sized PNGs are what
    // the Linux desktop entry and the tray fall back to.
    expect(icon).toContain("icons/icon.icns");
    expect(icon).toContain("icons/icon.ico");
    expect(icon).toContain("icons/32x32.png");
    expect(icon).toContain("icons/128x128.png");
    expect(icon).toContain("icons/128x128@2x.png");
  });

  test("every listed icon is actually in the tree", async () => {
    const { icon } = (await config).bundle;

    for (const relative of icon) {
      const path = `src-tauri/${relative}`;
      expect(await Bun.file(path).exists(), `${path} is missing`).toBe(true);
      expect((await Bun.file(path).arrayBuffer()).byteLength, `${path} is empty`).toBeGreaterThan(0);
    }
  });
});
