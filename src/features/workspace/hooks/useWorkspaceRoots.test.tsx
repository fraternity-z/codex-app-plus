import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceRoots } from "./useWorkspaceRoots";

const ROOTS_STORAGE_KEY = "codex-app-plus.workspace-roots";

describe("useWorkspaceRoots", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty until the user adds a workspace", () => {
    const { result } = renderHook(() => useWorkspaceRoots());

    expect(result.current.roots).toEqual([]);
    expect(result.current.selectedRootId).toBeNull();
  });

  it("persists manually added roots after remount", async () => {
    const first = renderHook(() => useWorkspaceRoots());

    act(() => {
      first.result.current.addRoot({ name: "FPGA", path: "E:/code/FPGA" });
    });

    expect(first.result.current.roots).toHaveLength(1);
    await waitFor(() => {
      expect(window.localStorage.getItem(ROOTS_STORAGE_KEY)).not.toBeNull();
    });

    first.unmount();

    const second = renderHook(() => useWorkspaceRoots());
    expect(second.result.current.roots).toHaveLength(1);
    expect(second.result.current.roots[0]).toMatchObject({
      name: "FPGA",
      path: "E:/code/FPGA",
      launchScript: null,
      launchScripts: null,
    });
  });

  it("shows a removed root again after manual re-add", () => {
    const { result } = renderHook(() => useWorkspaceRoots());

    act(() => {
      result.current.addRoot({ name: "FPGA", path: "E:/code/FPGA" });
    });

    const removedRoot = result.current.roots[0]!;

    act(() => {
      result.current.removeRoot(removedRoot.id);
    });

    act(() => {
      result.current.addRoot({ name: removedRoot.name, path: removedRoot.path });
    });

    expect(result.current.roots).toHaveLength(1);
    expect(result.current.roots[0]).toMatchObject({ name: removedRoot.name, path: removedRoot.path });
  });

  it("reorders roots and persists the new order", async () => {
    const hook = renderHook(() => useWorkspaceRoots());

    act(() => {
      hook.result.current.addRoot({ name: "FPGA", path: "E:/code/FPGA" });
      hook.result.current.addRoot({ name: "Codex", path: "E:/code/codex" });
      hook.result.current.addRoot({ name: "Docs", path: "E:/docs" });
    });

    expect(hook.result.current.roots.map((root) => root.name)).toEqual(["FPGA", "Codex", "Docs"]);

    act(() => {
      hook.result.current.reorderRoots(2, 0);
    });

    expect(hook.result.current.roots.map((root) => root.name)).toEqual(["Docs", "FPGA", "Codex"]);

    await waitFor(() => {
      expect(window.localStorage.getItem(ROOTS_STORAGE_KEY)).toContain("Docs");
    });

    hook.unmount();

    const remounted = renderHook(() => useWorkspaceRoots());
    expect(remounted.result.current.roots.map((root) => root.name)).toEqual(["Docs", "FPGA", "Codex"]);
  });

  it("persists launch script settings for a workspace", async () => {
    const first = renderHook(() => useWorkspaceRoots());

    act(() => {
      first.result.current.addRoot({ name: "FPGA", path: "E:/code/FPGA" });
    });

    const rootId = first.result.current.roots[0]?.id ?? "";
    act(() => {
      first.result.current.updateWorkspaceLaunchScripts({
        rootId,
        launchScript: "npm run dev",
        launchScripts: [
          {
            id: "web",
            script: "pnpm web",
            icon: "globe",
            label: "前端",
          },
        ],
      });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(ROOTS_STORAGE_KEY)).toContain("npm run dev");
    });

    first.unmount();

    const second = renderHook(() => useWorkspaceRoots());
    expect(second.result.current.roots[0]).toMatchObject({
      launchScript: "npm run dev",
      launchScripts: [
        {
          id: "web",
          script: "pnpm web",
          icon: "globe",
          label: "前端",
        },
      ],
    });
  });
});
