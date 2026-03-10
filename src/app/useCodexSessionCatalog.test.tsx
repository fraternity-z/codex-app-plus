import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../bridge/types";
import { useCodexSessionCatalog } from "./useCodexSessionCatalog";

describe("useCodexSessionCatalog", () => {
  it("loads codex sessions from the tauri bridge", async () => {
    const listCodexSessions = vi.fn().mockResolvedValue([
      {
        id: "local-1",
        title: "修复登录问题",
        branch: null,
        cwd: "E:/code/project-a",
        updatedAt: "2026-03-06T10:00:00.000Z"
      }
    ]);
    const hostBridge = { app: { listCodexSessions } } as unknown as HostBridge;

    const { result } = renderHook(() => useCodexSessionCatalog(hostBridge));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.sessions).toEqual([
      {
        id: "local-1",
        title: "修复登录问题",
        branch: null,
        cwd: "E:/code/project-a",
        archived: false,
        updatedAt: "2026-03-06T10:00:00.000Z",
        source: "codexData",
        status: "notLoaded",
        activeFlags: [],
        queuedCount: 0
      }
    ]);
  });

  it("surfaces bridge errors and clears them after a successful reload", async () => {
    const listCodexSessions = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([
        {
          id: "local-2",
          title: "新增侧栏目录",
          branch: null,
          cwd: "E:/code/project-b",
          updatedAt: "2026-03-06T11:00:00.000Z"
        }
      ]);
    const hostBridge = { app: { listCodexSessions } } as unknown as HostBridge;

    const { result } = renderHook(() => useCodexSessionCatalog(hostBridge));

    await waitFor(() => {
      expect(result.current.error).toBe("boom");
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({ id: "local-2", source: "codexData" });
  });
});
