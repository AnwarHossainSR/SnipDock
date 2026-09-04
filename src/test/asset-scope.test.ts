import { describe, expect, test } from "bun:test";

/**
 * The image preview is the one feature that depends on the webview reading a
 * file off disk, so it is the one feature the asset-protocol scope can break on
 * its own. Copying an image goes through Rust and keeps working either way,
 * which is what made the original bug read as "previews are broken" rather than
 * "the scope is wrong".
 */
describe("asset protocol scope", () => {
  const config = Bun.file("src-tauri/tauri.conf.json").json() as Promise<{
    identifier: string;
    app: { security: { csp: string; assetProtocol: { enable: boolean; scope: string[] } } };
  }>;

  test("is enabled, and scoped to the directory images are actually written to", async () => {
    const { identifier, app } = await config;
    const { assetProtocol } = app.security;

    expect(assetProtocol.enable).toBe(true);

    // `$APPDATA` already resolves to <roaming>/<identifier>. Repeating the
    // identifier inside the pattern - which is what shipped - points the scope
    // at <roaming>/<id>/<id>/images, a path that never exists, so every request
    // is denied and every thumbnail falls back to "Image unavailable".
    for (const pattern of assetProtocol.scope) {
      expect(pattern, "scope repeats the bundle identifier").not.toContain(identifier);
    }

    // IMAGE_DIR in src-tauri/src/features/images.rs, and the `.png` extension
    // that `images::resolve` enforces on the Rust side.
    expect(assetProtocol.scope).toContain("$APPDATA/images/*.png");
  });

  test("CSP admits the asset URL that convertFileSrc produces", async () => {
    const { csp } = (await config).app.security;
    const imgSrc = csp.split(";").find((directive) => directive.trim().startsWith("img-src"));

    // Windows serves the asset protocol over http://asset.localhost; the other
    // platforms use the asset: scheme. Both have to be listed or the preview
    // breaks on one platform only.
    expect(imgSrc).toContain("asset:");
    expect(imgSrc).toContain("http://asset.localhost");
  });
});
