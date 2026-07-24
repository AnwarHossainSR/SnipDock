import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { updateVersionFiles } from "./version";

test("synchronizes stable versions and changelog links", async () => {
  const root = await mkdtemp(join(tmpdir(), "snipdock-version-"));
  await mkdir(join(root, "src-tauri"));
  await writeFile(join(root, "package.json"), '{"name":"snipdock","version":"0.1.6"}\n');
  await writeFile(join(root, "src-tauri", "tauri.conf.json"), '{"version":"0.1.6"}\n');
  await writeFile(join(root, "src-tauri", "Cargo.toml"), '[package]\nname = "snipdock"\nversion = "0.1.6"\n');
  await writeFile(join(root, "src-tauri", "Cargo.lock"), '[[package]]\nname = "snipdock"\nversion = "0.1.6"\n');
  await writeFile(
    join(root, "CHANGELOG.md"),
    "## [Unreleased]\n\n### Fixed\n\n- One fix.\n\n## [0.1.6]\n\n[Unreleased]: https://example.test/compare/v0.1.6...HEAD\n[0.1.6]: https://example.test/v0.1.6\n",
  );

  try {
    await updateVersionFiles(root, "0.1.7", "2026-07-24");

    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).version).toBe("0.1.7");
    expect(JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8")).version).toBe("0.1.7");
    expect(await readFile(join(root, "src-tauri", "Cargo.toml"), "utf8")).toContain('version = "0.1.7"');
    expect(await readFile(join(root, "src-tauri", "Cargo.lock"), "utf8")).toContain('name = "snipdock"\nversion = "0.1.7"');
    const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("## [0.1.7] - 2026-07-24\n\n### Fixed");
    expect(changelog).toContain("[Unreleased]: https://example.test/compare/v0.1.7...HEAD");
    expect(changelog).toContain("[0.1.7]: https://example.test/compare/v0.1.6...v0.1.7");
    await expect(updateVersionFiles(root, "0.1.8-alpha.1", "2026-07-24")).rejects.toThrow();

    await writeFile(join(root, "CHANGELOG.md"), "## [Unreleased]\n");
    await expect(updateVersionFiles(root, "0.1.8", "2026-07-24")).rejects.toThrow();
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).version).toBe("0.1.7");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
