import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { updateVersionFiles } from "./version";

test("synchronizes stable versions and changelog links", async () => {
  const root = await mkdtemp(join(tmpdir(), "snipdock-version-"));
  await mkdir(join(root, "src-tauri"));
  await mkdir(join(root, "packages", "snipdock-cli"), { recursive: true });
  await writeFile(join(root, "package.json"), '{"name":"snipdock","version":"0.1.6"}\n');
  await writeFile(
    join(root, "packages", "snipdock-cli", "package.json"),
    '{"name":"snipdock","version":"0.1.6"}\n',
  );
  await writeFile(join(root, "src-tauri", "tauri.conf.json"), '{"version":"0.1.6"}\n');
  await writeFile(join(root, "src-tauri", "Cargo.toml"), '[package]\nname = "snipdock"\nversion = "0.1.6"\n');
  await writeFile(join(root, "src-tauri", "Cargo.lock"), '[[package]]\nname = "snipdock"\nversion = "0.1.6"\n');
  await writeFile(
    join(root, "bun.lock"),
    '{\n  "workspaces": {\n    "": { "name": "snipdock" },\n    "packages/snipdock-cli": {\n      "name": "snipdock",\n      "version": "0.1.6",\n    },\n  },\n}\n',
  );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "## [Unreleased]\n\n### Fixed\n\n- One fix.\n\n## [0.1.6]\n\n[Unreleased]: https://example.test/compare/v0.1.6...HEAD\n[0.1.6]: https://example.test/v0.1.6\n",
  );

  try {
    await updateVersionFiles(root, "0.1.7", "2026-07-24");

    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).version).toBe("0.1.7");
    expect(JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8")).version).toBe("0.1.7");
    expect(
      JSON.parse(await readFile(join(root, "packages", "snipdock-cli", "package.json"), "utf8")).version,
    ).toBe("0.1.7");
    expect(await readFile(join(root, "src-tauri", "Cargo.toml"), "utf8")).toContain('version = "0.1.7"');
    expect(await readFile(join(root, "src-tauri", "Cargo.lock"), "utf8")).toContain('name = "snipdock"\nversion = "0.1.7"');
    // The release workflow installs with --frozen-lockfile, so a stale
    // workspace version here would fail the release before it built anything.
    expect(await readFile(join(root, "bun.lock"), "utf8")).toContain('"version": "0.1.7"');
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

/**
 * A CHANGELOG.md saved with Windows line endings used to pass through the
 * heading insertion untouched — `String.replace` matches nothing and says
 * nothing — so the script reported success while the release got no heading
 * and its notes stayed under Unreleased. Every assertion here is about the
 * file the script has to cope with, not the one it would prefer.
 */
test("adds the release heading to a changelog saved with CRLF", async () => {
  const root = await mkdtemp(join(tmpdir(), "snipdock-version-crlf-"));
  await mkdir(join(root, "src-tauri"));
  await mkdir(join(root, "packages", "snipdock-cli"), { recursive: true });
  await writeFile(join(root, "package.json"), '{"name":"snipdock","version":"0.1.6"}\n');
  await writeFile(
    join(root, "packages", "snipdock-cli", "package.json"),
    '{"name":"snipdock","version":"0.1.6"}\n',
  );
  await writeFile(join(root, "src-tauri", "tauri.conf.json"), '{"version":"0.1.6"}\n');
  await writeFile(join(root, "src-tauri", "Cargo.toml"), '[package]\nname = "snipdock"\nversion = "0.1.6"\n');
  await writeFile(join(root, "src-tauri", "Cargo.lock"), '[[package]]\nname = "snipdock"\nversion = "0.1.6"\n');
  await writeFile(join(root, "bun.lock"), '{\n  "version": "0.1.6",\n}\n');
  await writeFile(
    join(root, "CHANGELOG.md"),
    "## [Unreleased]\r\n\r\n### Fixed\r\n\r\n- One fix.\r\n\r\n## [0.1.6]\r\n\r\n[Unreleased]: https://example.test/compare/v0.1.6...HEAD\r\n[0.1.6]: https://example.test/v0.1.6\r\n",
  );

  try {
    await updateVersionFiles(root, "0.1.7", "2026-07-24");

    const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
    // The heading exists, carries the date, and sits above the notes it names.
    expect(changelog).toContain("## [0.1.7] - 2026-07-24\r\n\r\n### Fixed");
    // Unreleased stays, empty, ready for the next round of work.
    expect(changelog).toContain("## [Unreleased]\r\n\r\n## [0.1.7]");
    // The `\r` is not swallowed into the rewritten link.
    expect(changelog).toContain("[Unreleased]: https://example.test/compare/v0.1.7...HEAD\r\n");
    expect(changelog).toContain("[0.1.7]: https://example.test/compare/v0.1.6...v0.1.7");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
