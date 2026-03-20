import { describe, expect, it } from "vitest";
import { appReducer, createInitialState } from "./appReducer";

describe("appReducer workspace switch", () => {
  it("tracks the latest completed workspace switch", () => {
    const started = appReducer(createInitialState(), {
      type: "workspaceSwitch/started",
      switchId: 1,
      rootId: "root-1",
      rootPath: "E:/code/project",
      startedAt: 100,
    });

    const completed = appReducer(started, {
      type: "workspaceSwitch/completed",
      switchId: 1,
      completedAt: 260,
      durationMs: 160,
    });

    expect(completed.workspaceSwitch).toEqual({
      switchId: 1,
      rootId: "root-1",
      rootPath: "E:/code/project",
      phase: "ready",
      startedAt: 100,
      completedAt: 260,
      durationMs: 160,
      error: null,
    });
  });

  it("ignores stale completions from an older switch", () => {
    const state = appReducer(createInitialState(), {
      type: "workspaceSwitch/started",
      switchId: 2,
      rootId: "root-2",
      rootPath: "E:/code/new-project",
      startedAt: 200,
    });

    const nextState = appReducer(state, {
      type: "workspaceSwitch/completed",
      switchId: 1,
      completedAt: 400,
      durationMs: 250,
    });

    expect(nextState.workspaceSwitch.phase).toBe("switching");
    expect(nextState.workspaceSwitch.switchId).toBe(2);
    expect(nextState.workspaceSwitch.rootId).toBe("root-2");
  });
});
