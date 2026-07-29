#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, chmodSync, unlinkSync, readFileSync, renameSync } from "fs";
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

Usage: snipdock <command>

Commands:
  install     Download and install SnipDock
  run         Launch SnipDock
  update      Update to latest version
  uninstall   Remove SnipDock
  version     Show current version
  help        Show this help message

Examples:
  snipdock install       # Install SnipDock
  snipdock run           # Launch SnipDock
  npx snipdock install   # Install via npx
  bunx snipdock install  # Install via bunx
`);
}

function showVersion(): void {
  console.log(`snipdock v${SNIPDOCK_VERSION}`);
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
    default:
      showHelp();
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
