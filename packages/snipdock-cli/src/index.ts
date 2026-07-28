#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, chmodSync, unlinkSync, readFileSync } from "fs";
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

function getPlatform(): Platform {
  const os = process.platform;
  const arch = process.arch;

  let osName: string;
  let archName: string;
  let binary: string;
  let extension = "";

  switch (os) {
    case "win32":
      osName = "windows";
      binary = "snipdock.exe";
      extension = ".exe";
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

  const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${SNIPDOCK_VERSION}/snipdock_${osName}_${archName}${extension}.gz`;

  return { os: osName, arch: archName, binary, downloadUrl };
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
  }

  fileStream.end();
}

async function decompressGzip(gzipPath: string, outputPath: string): Promise<void> {
  const { createReadStream } = await import("fs");
  const { pipeline } = await import("stream/promises");
  const { createGunzip } = await import("zlib");

  await pipeline(
    createReadStream(gzipPath),
    createGunzip(),
    createWriteStream(outputPath)
  );
}

async function downloadBinary(): Promise<void> {
  const platform = getPlatform();
  const gzipPath = join(INSTALL_DIR, `${platform.binary}.gz`);
  const binaryPath = join(INSTALL_DIR, platform.binary);

  console.log(`Downloading SnipDock v${SNIPDOCK_VERSION} for ${platform.os}/${platform.arch}...`);

  if (!existsSync(INSTALL_DIR)) {
    mkdirSync(INSTALL_DIR, { recursive: true });
  }

  try {
    await downloadFile(platform.downloadUrl, gzipPath);
    await decompressGzip(gzipPath, binaryPath);

    if (platform.os !== "windows") {
      chmodSync(binaryPath, 0o755);
    }

    unlinkSync(gzipPath);

    console.log(`SnipDock installed to: ${binaryPath}`);
  } catch (error) {
    console.error("Failed to download SnipDock:", error);
    throw error;
  }
}

function runBinary(): void {
  const platform = getPlatform();
  const binaryPath = join(INSTALL_DIR, platform.binary);

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
  const platform = getPlatform();
  const binaryPath = join(INSTALL_DIR, platform.binary);

  if (existsSync(binaryPath)) {
    unlinkSync(binaryPath);
    console.log("SnipDock uninstalled successfully.");
  } else {
    console.log("SnipDock is not installed.");
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] || "help";

  switch (command) {
    case "install":
      await downloadBinary();
      break;
    case "run":
      runBinary();
      break;
    case "update":
      uninstall();
      await downloadBinary();
      break;
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
