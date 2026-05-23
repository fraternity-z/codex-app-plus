#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUT = path.resolve("src-tauri/bundled/codex-cli");
const META_PACKAGE_RELATIVE = "npm/node_modules/@openai/codex";
const PLATFORM_PACKAGE_RELATIVES = {
  windowsX64: "npm/node_modules/@openai/codex-win32-x64",
  windowsArm64: "npm/node_modules/@openai/codex-win32-arm64",
  linuxX64: "npm/node_modules/@openai/codex-linux-x64",
  linuxArm64: "npm/node_modules/@openai/codex-linux-arm64",
};

const args = parseArgs(process.argv.slice(2));
const outRoot = path.resolve(args.out ?? DEFAULT_OUT);
const npmCommand = process.platform === 'win32' ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd'] } : { file: 'npm', args: [] };

if (!args.source && !args.npm) {
  args.source = "E:/code/codex";
}

await main();

async function main() {
  rmSync(path.join(outRoot, "npm"), { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });

  let sourceInfo;
  if (args.npm) {
    sourceInfo = installFromNpm(args.npm, outRoot);
  } else {
    sourceInfo = await copyFromOfficialSource(path.resolve(args.source), outRoot);
  }

  const manifest = {
    schemaVersion: 2,
    distribution: "official-npm",
    version: sourceInfo.version,
    source: sourceInfo.source,
    npmPackage: {
      name: "@openai/codex",
      root: META_PACKAGE_RELATIVE,
      platformPackages: PLATFORM_PACKAGE_RELATIVES,
    },
  };

  writeFileSync(
    path.join(outRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`Synced official Codex npm package to ${outRoot}`);
}

async function copyFromOfficialSource(sourceRoot, outRoot) {
  const codexCliRoot = path.join(sourceRoot, "codex-cli");
  const packageJsonPath = path.join(codexCliRoot, "package.json");
  const binPath = path.join(codexCliRoot, "bin", "codex.js");
  if (!existsSync(packageJsonPath) || !existsSync(binPath)) {
    throw new Error(`Official codex-cli package not found: ${codexCliRoot}`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packageRoot = path.join(outRoot, META_PACKAGE_RELATIVE);
  mkdirSync(path.join(packageRoot, "bin"), { recursive: true });
  await copyFile(binPath, path.join(packageRoot, "bin", "codex.js"));

  const rgManifest = path.join(codexCliRoot, "bin", "rg");
  if (existsSync(rgManifest)) {
    await copyFile(rgManifest, path.join(packageRoot, "bin", "rg"));
  }

  const readme = path.join(sourceRoot, "README.md");
  if (existsSync(readme)) {
    await copyFile(readme, path.join(packageRoot, "README.md"));
  }

  const vendorRoot = path.join(codexCliRoot, "vendor");
  if (existsSync(vendorRoot)) {
    await cp(vendorRoot, path.join(packageRoot, "vendor"), {
      recursive: true,
      force: true,
      dereference: true,
    });
  } else {
    console.warn(
      `Warning: ${vendorRoot} is missing. Run the official codex-cli/scripts/install_native_deps.py first, or use --npm.`,
    );
  }

  packageJson.version = args.version ?? packageJson.version ?? "0.0.0-dev";
  packageJson.files = ["bin", "vendor"];
  writeFileSync(path.join(packageRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  return {
    version: packageJson.version,
    source: {
      package: "@openai/codex",
      specifier: null,
      localPath: normalizePath(sourceRoot),
      commit: gitCommit(sourceRoot),
    },
  };
}

function installFromNpm(specifier, outRoot) {
  const npmRoot = path.join(outRoot, "npm");
  mkdirSync(npmRoot, { recursive: true });
  execFileSync(
    npmCommand.file,
    [...npmCommand.args, ...[
      "install",
      "--prefix",
      npmRoot,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      specifier,
    ]],
    { stdio: "inherit" },
  );

  const packageRoot = path.join(outRoot, META_PACKAGE_RELATIVE);
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`npm install did not produce ${META_PACKAGE_RELATIVE}`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  installDeclaredPlatformPackages(npmRoot, packageJson);

  return {
    version: packageJson.version ?? specifier,
    source: {
      package: "@openai/codex",
      specifier,
      localPath: null,
      commit: null,
    },
  };
}

function installDeclaredPlatformPackages(npmRoot, packageJson) {
  const optionalDependencies = packageJson.optionalDependencies ?? {};
  for (const [alias, spec] of Object.entries(optionalDependencies)) {
    if (!alias.startsWith("@openai/codex-")) {
      continue;
    }
    try {
      execFileSync(
        npmCommand.file,
        [...npmCommand.args, ...[
          "install",
          "--prefix",
          npmRoot,
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--force",
          `${alias}@${spec}`,
        ]],
        { stdio: "inherit" },
      );
    } catch (error) {
      console.warn(`Warning: failed to install optional platform package ${alias}: ${error}`);
    }
  }
}

async function copyFile(source, destination) {
  mkdirSync(path.dirname(destination), { recursive: true });
  await cp(source, destination, { force: true, dereference: true });
}

function gitCommit(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      parsed.source = requireValue(argv, ++index, arg);
    } else if (arg === "--npm") {
      parsed.npm = requireValue(argv, ++index, arg);
    } else if (arg === "--out") {
      parsed.out = requireValue(argv, ++index, arg);
    } else if (arg === "--version") {
      parsed.version = requireValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.source && parsed.npm) {
    throw new Error("Use either --source or --npm, not both.");
  }
  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  pnpm sync:codex-cli -- --source E:/code/codex
  pnpm sync:codex-cli -- --npm @openai/codex@0.133.0

Options:
  --source <path>   Local official openai/codex checkout. Defaults to E:/code/codex.
  --npm <spec>      Install a published official npm package specifier.
  --out <path>      Bundled module root. Defaults to src-tauri/bundled/codex-cli.
  --version <ver>   Override package version when syncing from --source.
`);
}
