import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

export async function updateVersionFiles(
  root: string,
  version: string,
  date = new Date().toISOString().slice(0, 10),
) {
  if (!STABLE_VERSION.test(version)) {
    throw new Error(`Version must match X.Y.Z; got ${version}`);
  }

  const packagePath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const previous = packageJson.version;
  if (!STABLE_VERSION.test(previous)) throw new Error(`Current version is invalid: ${previous}`);
  packageJson.version = version;

  const tauriPath = join(root, "src-tauri", "tauri.conf.json");
  const tauriJson = JSON.parse(await readFile(tauriPath, "utf8"));
  tauriJson.version = version;

  const cargoPath = join(root, "src-tauri", "Cargo.toml");
  const cargo = await readFile(cargoPath, "utf8");
  const nextCargo = cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`);

  const lockPath = join(root, "src-tauri", "Cargo.lock");
  const lock = await readFile(lockPath, "utf8");
  const nextLock = lock.replace(
    /(\[\[package\]\]\r?\nname = "snipdock"\r?\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  );

  const changelogPath = join(root, "CHANGELOG.md");
  let changelog = await readFile(changelogPath, "utf8");
  if (changelog.includes(`## [${version}]`)) throw new Error(`${version} already exists in CHANGELOG.md`);
  changelog = changelog.replace(
    "## [Unreleased]\n",
    `## [Unreleased]\n\n## [${version}] - ${date}\n`,
  );
  const compare = changelog.match(/^\[Unreleased\]: (.+\/compare\/)v[^\s]+?\.\.\.HEAD$/m)?.[1];
  if (!compare) throw new Error("CHANGELOG.md has no Unreleased comparison link");
  changelog = changelog.replace(
    /^\[Unreleased\]: .+$/m,
    `[Unreleased]: ${compare}v${version}...HEAD`,
  );
  changelog = changelog.replace(
    new RegExp(`^\\[${previous.replaceAll(".", "\\.")}\\]:`, "m"),
    `[${version}]: ${compare}v${previous}...v${version}\n[${previous}]:`,
  );

  await Promise.all([
    writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(tauriPath, `${JSON.stringify(tauriJson, null, 2)}\n`),
    writeFile(cargoPath, nextCargo),
    writeFile(lockPath, nextLock),
    writeFile(changelogPath, changelog),
  ]);
}

if (import.meta.main) {
  const version = Bun.argv[2];
  if (!version) throw new Error("Usage: bun run version X.Y.Z");
  await updateVersionFiles(process.cwd(), version);
  console.log(`Updated SnipDock to ${version}`);
}
