import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const OUTPUT_TS = resolve("src/protocol/generated");
const OUTPUT_SCHEMA = resolve("src/protocol/schema");
const defaultCodexPath = resolve(
  "E:/code/codex-official-deconstructed/unpacked/resources-runtime/codex.exe"
);
const codexBinary = process.env.CODEX_BINARY_PATH ?? defaultCodexPath;

function runCodex(args) {
  const result = spawnSync(codexBinary, args, {
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`命令失败: ${codexBinary} ${args.join(" ")}`);
  }
}

function recreate(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
  mkdirSync(dirPath, { recursive: true });
}

function main() {
  recreate(OUTPUT_TS);
  recreate(OUTPUT_SCHEMA);
  runCodex(["app-server", "generate-ts", "--out", OUTPUT_TS, "--experimental"]);
  runCodex(["app-server", "generate-json-schema", "--out", OUTPUT_SCHEMA, "--experimental"]);
}

main();
