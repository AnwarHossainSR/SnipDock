#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, chmodSync, unlinkSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const SNIPDOCK_VERSION = pkg.version;
const INSTALL_DIR = join(homedir(), ".snipdock");
const BINARY_PATH = join(INSTALL_DIR, "snipdock");
const GITHUB_REPO = "AnwarHossainSR/SnipDock";

interface Platform {
  os: string;
  arch: string;
  binary: string;
  downloadUrl: string;
}

function getPlatform(version: string): Platform {
  const os = process.platform;
  const arch = process.arch;

  let osName: string;
  let archName: string;
  let binary: string;

  switch (os) {
    case "win32":
      osName = "windows";
      binary = "snipdock.exe";
      break;
    case "darwin":
      osName = "macos";
      binary = "snipdock";
      break;
    case "linux":
      osName = "linux";
      binary = "snipdock";
      break;
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }

  switch (arch) {
    case "x64":
    case "x86_64":
      archName = "x86_64";
      break;
    case "arm64":
      archName = "aarch64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  const publishedTargets = new Set(["windows_x86_64", "macos_aarch64", "linux_x86_64"]);
  if (!publishedTargets.has(`${osName}_${archName}`)) {
    throw new Error(
      `No SnipDock release is published for ${osName}/${archName}. ` +
      `Supported targets: ${[...publishedTargets].join(", ")}.`,
    );
  }

  let downloadUrl: string;

  if (osName === "windows") {
    downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/SnipDock_${version}_x64-setup.exe`;
  } else if (osName === "macos") {
    downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/SnipDock_${version}_${archName}.dmg`;
  } else {
    downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/SnipDock_${version}_${archName === "x86_64" ? "amd64" : archName}.deb`;
  }

  return { os: osName, arch: archName, binary, downloadUrl };
}

async function resolveLatestVersion(): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!response.ok) {
    throw new Error(`Failed to resolve latest release: ${response.statusText}`);
  }
  const data = (await response.json()) as { tag_name?: string };
  if (!data.tag_name) {
    throw new Error("Latest release has no tag name");
  }
  return data.tag_name.replace(/^v/, "");
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const fileStream = createWriteStream(dest);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!fileStream.write(value)) {
        await new Promise<void>((resolve) => fileStream.once("drain", resolve));
      }
    }
  } catch (error) {
    fileStream.destroy();
    throw error;
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.end((error: Error | null | undefined) => {
      if (error) reject(error);
      else resolve();
    });
  });
}



async function downloadBinary(version: string): Promise<void> {
  const platform = getPlatform(version);
  const binaryPath = join(INSTALL_DIR, platform.binary);
  const stagedPath = join(INSTALL_DIR, `${platform.binary}.download`);

  console.log(`Downloading SnipDock v${version} for ${platform.os}/${platform.arch}...`);

  if (!existsSync(INSTALL_DIR)) {
    mkdirSync(INSTALL_DIR, { recursive: true });
  }

  try {
    await downloadFile(platform.downloadUrl, stagedPath);

    if (platform.os === "windows") {
      renameSync(stagedPath, join(INSTALL_DIR, "SnipDock-installer.exe"));
      console.log(`SnipDock installer downloaded to: ${join(INSTALL_DIR, "SnipDock-installer.exe")}`);
      console.log(`Run "snipdock run" to launch the installer.`);
    } else {
      chmodSync(stagedPath, 0o755);
      renameSync(stagedPath, binaryPath);
      console.log(`SnipDock installed to: ${binaryPath}`);
    }
  } catch (error) {
    if (existsSync(stagedPath)) unlinkSync(stagedPath);
    console.error("Failed to download SnipDock. Existing installation left untouched.", error);
    throw error;
  }
}

function runBinary(): void {
  const platform = getPlatform(SNIPDOCK_VERSION);
  const binaryPath = join(INSTALL_DIR, platform.binary);

  if (platform.os === "windows") {
    const installerPath = join(INSTALL_DIR, "SnipDock-installer.exe");
    if (!existsSync(installerPath)) {
      console.error("SnipDock not installed. Run: snipdock install");
      process.exit(1);
    }
    const child = spawn(installerPath, [], {
      stdio: "inherit",
      detached: true,
    });
    child.unref();
    return;
  }

  if (!existsSync(binaryPath)) {
    console.error("SnipDock not installed. Run: snipdock install");
    process.exit(1);
  }

  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: "inherit",
    detached: true,
  });

  child.unref();
}

function showHelp(): void {
  console.log(`
SnipDock CLI - Clipboard Manager Installer

Usage: snipdock <command> [args]

Installer commands:
  install                    Download and install SnipDock
  run                        Launch SnipDock
  update                     Update to latest version
  uninstall                  Remove SnipDock
  version                    Show current version
  help                       Show this help message

Desktop commands (require a running SnipDock):
  pin <id>                   Pin the item with the given id
  unpin <id>                 Unpin the item with the given id
  favorite <id>              Mark the item as a favorite
  unfavorite <id>            Remove the favorite mark from the item
  tag <id> <tag>             Attach a tag to the item (creates the tag if missing)
  search <query>             Print matching item ids, one per line
  paste <id>                 Place the item's content on the system clipboard
  export <path>              Export stored items to the given file

Examples:
  snipdock install           # Install SnipDock
  snipdock run               # Launch SnipDock
  snipdock search "hello"    # Search stored items
  npx snipdock install       # Install via npx
  bunx snipdock install      # Install via bunx
`);
}

// -- CLI subcommands --------------------------------------------------------

export interface CliEndpoint {
  token: string;
  port: number;
}

/**
 * Locates the per-launch token + port the desktop app wrote into the SnipDock
 * data directory. Returns `null` if SnipDock is not running (or wrote the
 * files somewhere unexpected); the caller maps that to the documented
 * "snipdock run" hint.
 */
export function discoverEndpoint(): CliEndpoint | null {
  const dataDir = dataDirPath();
  const tokenPath = join(dataDir, "cli-token");
  const portPath = join(dataDir, "cli-port");
  if (!existsSync(tokenPath) || !existsSync(portPath)) {
    return null;
  }
  const token = readFileSync(tokenPath, "utf-8").trim();
  const portText = readFileSync(portPath, "utf-8").trim();
  // `Number.parseInt` would accept "123junk" and "1.5" and hand back a port
  // that points at something else entirely, so the text has to be digits and
  // the value has to be a real TCP port.
  if (!token || !/^\d+$/.test(portText)) {
    return null;
  }
  const port = Number(portText);
  if (port < 1 || port > 65535) {
    return null;
  }
  return { token, port };
}

export function dataDirPath(): string {
  let dir: string;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    dir = join(appData, "com.snipdock.app");
  } else if (process.platform === "darwin") {
    dir = join(homedir(), "Library", "Application Support", "com.snipdock.app");
  } else {
    const xdg = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
    dir = join(xdg, "com.snipdock.app");
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export interface HttpError {
  code: string;
  message: string;
}

/**
 * Posts a JSON body to one of the SnipDock desktop endpoints. The endpoint
 * is discovered from the data directory; the bearer token is the same one
 * the desktop app generated at launch. Returns the parsed JSON response on
 * success and throws a `HttpError` on any non-2xx.
 */
export async function postJson(
  endpoint: CliEndpoint,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text.length > 0 ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = (parsed as { error?: HttpError }).error ?? {
      code: "http_error",
      message: `request failed with status ${response.status}`,
    };
    throw error;
  }
  return parsed;
}

const NOT_RUNNING_MESSAGE =
  "SnipDock is not running. Launch it first with: snipdock run";

export async function runCliCommand(
  argv: string[],
  deps: { discover: () => CliEndpoint | null } = { discover: discoverEndpoint },
): Promise<number> {
  const command = argv[0];
  const rest = argv.slice(1);
  switch (command) {
    case "pin":
      return await cliSetFlag(deps, "/pin", "pinned", rest);
    case "unpin":
      return await cliSetFlag(deps, "/unpin", "unpinned", rest);
    case "favorite":
      return await cliSetFlag(deps, "/favorite", "favorited", rest);
    case "unfavorite":
      return await cliSetFlag(deps, "/unfavorite", "unfavorited", rest);
    case "tag":
      return await cliTag(deps, rest);
    case "search":
      return await cliSearch(deps, rest);
    case "paste":
      return await cliPaste(deps, rest);
    case "export":
      return await cliExport(deps, rest);
    case "help":
      showHelp();
      return 0;
    case undefined:
      console.error("Usage: snipdock <command>");
      return 1;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'snipdock help' for a list of commands.");
      return 1;
  }
}

function requireEndpoint(
  deps: { discover: () => CliEndpoint | null },
): CliEndpoint | null {
  const endpoint = deps.discover();
  if (!endpoint) {
    console.error(NOT_RUNNING_MESSAGE);
    return null;
  }
  return endpoint;
}

async function cliSetFlag(
  deps: { discover: () => CliEndpoint | null },
  path: string,
  past: string,
  rest: string[],
): Promise<number> {
  const id = rest[0];
  if (!id) {
    console.error(`Usage: snipdock ${path.slice(1)} <id>`);
    return 1;
  }
  const endpoint = requireEndpoint(deps);
  if (!endpoint) return 1;
  try {
    await postJson(endpoint, path, { id });
    console.log(`${past} ${id}`);
    return 0;
  } catch (error) {
    return printHttpError(error);
  }
}

async function cliTag(
  deps: { discover: () => CliEndpoint | null },
  rest: string[],
): Promise<number> {
  const [id, tag] = rest;
  if (!id || !tag) {
    console.error("Usage: snipdock tag <id> <tag>");
    return 1;
  }
  const endpoint = requireEndpoint(deps);
  if (!endpoint) return 1;
  try {
    await postJson(endpoint, "/tag", { id, tag });
    console.log(`tagged ${id} with ${tag}`);
    return 0;
  } catch (error) {
    return printHttpError(error);
  }
}

async function cliSearch(
  deps: { discover: () => CliEndpoint | null },
  rest: string[],
): Promise<number> {
  const query = rest.join(" ").trim();
  if (!query) {
    console.error("Usage: snipdock search <query>");
    return 1;
  }
  const endpoint = requireEndpoint(deps);
  if (!endpoint) return 1;
  try {
    const result = (await postJson(endpoint, "/search", { query })) as {
      ids: string[];
      total: number;
    };
    for (const id of result.ids) {
      console.log(id);
    }
    return 0;
  } catch (error) {
    return printHttpError(error);
  }
}

async function cliPaste(
  deps: { discover: () => CliEndpoint | null },
  rest: string[],
): Promise<number> {
  const id = rest[0];
  if (!id) {
    console.error("Usage: snipdock paste <id>");
    return 1;
  }
  const endpoint = requireEndpoint(deps);
  if (!endpoint) return 1;
  try {
    await postJson(endpoint, "/paste", { id });
    console.log(`copied ${id} to the clipboard`);
    return 0;
  } catch (error) {
    return printHttpError(error);
  }
}

async function cliExport(
  deps: { discover: () => CliEndpoint | null },
  rest: string[],
): Promise<number> {
  const path = rest[0];
  if (!path) {
    console.error("Usage: snipdock export <path>");
    return 1;
  }
  const endpoint = requireEndpoint(deps);
  if (!endpoint) return 1;
  try {
    const result = (await postJson(endpoint, "/export", {
      format: "default",
      path,
    })) as { path: string; item_count: number };
    console.log(`exported ${result.item_count} items to ${result.path}`);
    return 0;
  } catch (error) {
    return printHttpError(error);
  }
}

function printHttpError(error: unknown): number {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const httpError = error as HttpError;
    if (httpError.code === "not_found") {
      console.error(`item not found: ${httpError.message}`);
    } else if (httpError.code === "validation") {
      console.error(`validation: ${httpError.message}`);
    } else {
      console.error(`${httpError.code}: ${httpError.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  return 1;
}

function uninstall(): void {
  const platform = getPlatform(SNIPDOCK_VERSION);
  const binaryPath = join(INSTALL_DIR, platform.binary);
  const installerPath = join(INSTALL_DIR, "SnipDock-installer.exe");

  let removed = false;

  if (existsSync(binaryPath)) {
    unlinkSync(binaryPath);
    removed = true;
  }

  if (existsSync(installerPath)) {
    unlinkSync(installerPath);
    removed = true;
  }

  if (removed) {
    console.log("SnipDock uninstalled successfully.");
  } else {
    console.log("SnipDock is not installed.");
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] || "help";

  switch (command) {
    case "install":
      await downloadBinary(SNIPDOCK_VERSION);
      break;
    case "run":
      runBinary();
      break;
    case "update": {
      const latest = await resolveLatestVersion();
      console.log(`Latest version is v${latest}.`);
      await downloadBinary(latest);
      break;
    }
    case "uninstall":
      uninstall();
      break;
    case "version":
      showVersion();
      break;
    case "help":
    default: {
      const cliCommands = new Set([
        "pin", "unpin", "favorite", "unfavorite", "tag",
        "search", "paste", "export",
      ]);
      if (cliCommands.has(command)) {
        const exitCode = await runCliCommand([command, ...process.argv.slice(3)]);
        process.exit(exitCode);
      }
      showHelp();
    }
  }
}

function showVersion(): void {
  console.log(`snipdock v${SNIPDOCK_VERSION}`);
}

// Silence the unused-write warning on systems where the helper is referenced
// only through the test harness. The export entry points are also exposed
// under these names so the test file can stub `discover` and `postJson`.
export { showHelp, showVersion };

// `writeFileSync` is only used by the test suite to seed the data dir, but
// importing the symbol above covers the runtime path; the reference below
// keeps it in the bundle for tree-shaking-aware tooling.
void writeFileSync;

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
