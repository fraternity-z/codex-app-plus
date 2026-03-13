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
    expect(second.result.current.roots[0]).toMatchObject({ name: "FPGA", path: "E:/code/FPGA" });
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
});
