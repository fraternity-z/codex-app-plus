import { describe, expect, it } from "vitest";
import { normalizeWorkspacePath, resolveAgentWorkspacePath } from "./workspacePath";

describe("workspacePath", () => {
  it("maps Windows drive paths to WSL mount paths", () => {
    expect(resolveAgentWorkspacePath("E:/code/repo", "wsl")).toBe("/mnt/e/code/repo");
    expect(normalizeWorkspacePath("E:\\code\\repo")).toBe("/mnt/e/code/repo");
  });

  it("normalizes file URIs before resolving paths", () => {
    expect(resolveAgentWorkspacePath("file:///E:/code/repo", "windowsNative")).toBe("E:/code/repo");
    expect(resolveAgentWorkspacePath("file://localhost/E:/code/repo", "windowsNative")).toBe("E:/code/repo");
    expect(resolveAgentWorkspacePath("file:///E:/code/repo", "wsl")).toBe("/mnt/e/code/repo");
    expect(normalizeWorkspacePath("file:///E:/code/repo")).toBe("/mnt/e/code/repo");
  });

  it("maps WSL UNC paths to Linux paths", () => {
    expect(resolveAgentWorkspacePath("\\\\wsl.localhost\\Ubuntu\\home\\me\\repo", "wsl")).toBe("/home/me/repo");
    expect(normalizeWorkspacePath("\\\\wsl$\\Ubuntu\\home\\me\\repo")).toBe("/home/me/repo");
  });

  it("keeps Linux paths unchanged in WSL mode", () => {
    expect(resolveAgentWorkspacePath("/home/me/repo", "wsl")).toBe("/home/me/repo");
  });

  it("throws on unsupported WSL path conversion", () => {
    expect(() => resolveAgentWorkspacePath("repo", "wsl")).toThrow(/WSL/);
  });
});
