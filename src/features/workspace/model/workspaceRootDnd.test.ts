import { describe, expect, it } from "vitest";
import type { WorkspaceRoot } from "../hooks/useWorkspaceRoots";
import {
  WORKSPACE_DND_CENTER_HOVER_MS,
  getWorkspaceGroupKey,
  resolveWorkspaceDropTargetIndex,
} from "./workspaceRootDnd";

function createRoot(id: string, name: string, path: string): WorkspaceRoot {
  return { id, name, path, launchScript: null, launchScripts: null };
}

describe("workspaceRootDnd", () => {
  it("derives stable group key from first normalized path segment", () => {
    const root = createRoot("1", "Client", "E:/Code/Client/app");
    expect(getWorkspaceGroupKey(root)).toBe("code");
  });

  it("drops before target when pointer is in top zone", () => {
    const roots = [
      createRoot("a", "A", "E:/code/A"),
      createRoot("b", "B", "E:/code/B"),
      createRoot("c", "C", "E:/code/C"),
    ];

    const target = resolveWorkspaceDropTargetIndex({
      roots,
      activeId: "c",
      overId: "a",
      pointerY: 5,
      overTop: 0,
      overHeight: 100,
      now: 1000,
      hoverState: { overId: null, enteredAt: 0 },
    });

    expect(target).toBe(0);
  });

  it("uses center hover rule to insert after hovered item", () => {
    const roots = [
      createRoot("a", "A", "E:/code/A"),
      createRoot("b", "B", "E:/code/B"),
      createRoot("c", "C", "E:/code/C"),
    ];

    const target = resolveWorkspaceDropTargetIndex({
      roots,
      activeId: "a",
      overId: "b",
      pointerY: 50,
      overTop: 0,
      overHeight: 100,
      now: 1000 + WORKSPACE_DND_CENTER_HOVER_MS,
      hoverState: { overId: "b", enteredAt: 1000 },
    });

    expect(target).toBe(2);
  });

  it("keeps contiguous group insertion boundary when moving from outside the group", () => {
    const roots = [
      createRoot("x", "X", "E:/other/X"),
      createRoot("a1", "A1", "E:/code/A1"),
      createRoot("a2", "A2", "E:/code/A2"),
      createRoot("y", "Y", "E:/misc/Y"),
    ];

    const target = resolveWorkspaceDropTargetIndex({
      roots,
      activeId: "x",
      overId: "a2",
      pointerY: 95,
      overTop: 0,
      overHeight: 100,
      now: 2000,
      hoverState: { overId: null, enteredAt: 0 },
    });

    expect(target).toBe(3);
  });
});
