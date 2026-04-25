import { describe, expect, it } from "vitest";
import { classifyCommand } from "./commandIntent";

describe("classifyCommand", () => {
  it("classifies cat as read", () => {
    expect(classifyCommand("cat src/foo.ts")).toEqual({ kind: "readFile", path: "src/foo.ts" });
    expect(classifyCommand("cat -n src/foo.ts")).toEqual({ kind: "readFile", path: "src/foo.ts" });
  });

  it("classifies head/tail as read", () => {
    expect(classifyCommand("head -n 50 README.md")).toEqual({ kind: "readFile", path: "README.md" });
    expect(classifyCommand("tail -n 20 logs/server.log")).toEqual({ kind: "readFile", path: "logs/server.log" });
  });

  it("classifies PowerShell Get-Content as read", () => {
    expect(classifyCommand("Get-Content src/app.ts")).toEqual({ kind: "readFile", path: "src/app.ts" });
    expect(classifyCommand("Get-Content -Path src/app.ts -Tail 50")).toEqual({ kind: "readFile", path: "src/app.ts" });
    expect(classifyCommand("type file.txt")).toEqual({ kind: "readFile", path: "file.txt" });
  });

  it("does not classify search commands inside absolute PowerShell wrappers", () => {
    expect(classifyCommand(`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '[Console]::InputEncoding  = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
chcp 65001 > $null
rg -n "ConversationPane|ControlBar" src'`)).toBeNull();
  });

  it("aggregates multi-file reads from compound PowerShell commands", () => {
    expect(classifyCommand(`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content package.json
Get-Content tsconfig.json
if (Test-Path .trellis\\workflow.md) { Write-Host ready; Get-Content .trellis\\workflow.md }
if (Test-Path .trellis\\spec) { Get-ChildItem .trellis\\spec -Recurse -File | Select-Object FullName }'`)).toEqual({
      kind: "readFiles",
      paths: ["package.json", "tsconfig.json", ".trellis\\workflow.md"],
    });
  });

  it("classifies sed -n as read", () => {
    expect(classifyCommand("sed -n '1,50p' src/app.ts")).toEqual({ kind: "readFile", path: "src/app.ts" });
  });

  it("classifies sed -i as edit", () => {
    expect(classifyCommand("sed -i 's/foo/bar/g' src/app.ts")).toEqual({ kind: "editFile", path: "src/app.ts" });
  });

  it("classifies apply_patch as edit", () => {
    expect(classifyCommand("apply_patch")).toEqual({ kind: "editFile", path: null });
  });

  it("does not classify directory listing commands", () => {
    expect(classifyCommand("ls")).toBeNull();
    expect(classifyCommand("ls -la src/")).toBeNull();
    expect(classifyCommand("dir src\\state")).toBeNull();
    expect(classifyCommand("Get-ChildItem -Path src/features")).toBeNull();
  });

  it("does not classify content search commands", () => {
    expect(classifyCommand("rg pattern")).toBeNull();
    expect(classifyCommand("rg -n pattern src/")).toBeNull();
    expect(classifyCommand("grep -r foo lib")).toBeNull();
  });

  it("does not classify file search commands", () => {
    expect(classifyCommand("find src -name \"*.ts\"")).toBeNull();
    expect(classifyCommand("find .")).toBeNull();
  });

  it("unwraps bash -lc wrappers", () => {
    expect(classifyCommand("bash -lc \"cat src/foo.ts\"")).toEqual({ kind: "readFile", path: "src/foo.ts" });
    expect(classifyCommand("bash -c 'rg pattern src/'")).toBeNull();
  });

  it("unwraps WSL wrappers", () => {
    expect(classifyCommand(`"C:\\Windows\\System32\\wsl.exe" -e bash -lc "cat src/foo.ts"`)).toEqual({
      kind: "readFile",
      path: "src/foo.ts",
    });
    expect(classifyCommand(`wsl.exe -d Ubuntu bash -lc "rg pattern src/"`)).toBeNull();
  });

  it("returns null for unknown commands", () => {
    expect(classifyCommand("pnpm test")).toBeNull();
    expect(classifyCommand("git status")).toBeNull();
    expect(classifyCommand("node scripts/build.mjs")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(classifyCommand("")).toBeNull();
    expect(classifyCommand("   ")).toBeNull();
  });
});
