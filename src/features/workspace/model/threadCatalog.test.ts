import { describe, expect, it, vi } from "vitest";
import { mapThreadToSummary } from "../../../protocol/mappers";
import { listAllThreads, mapCodexSessionsToThreads, mergeThreadCatalogs } from "./threadCatalog";

function createRpcThread(overrides?: Partial<{ readonly id: string; readonly updatedAt: number; readonly name: string | null; readonly cwd: string | null }>) {
  return {
    id: overrides?.id ?? "thread-1",
    preview: "preview",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: overrides?.updatedAt ?? 2,
    status: { type: "idle" as const },
    path: null,
    cwd: overrides?.cwd ?? "E:/code/project-a",
    cliVersion: "0.0.1",
    source: "appServer" as const,
    agentNickname: null,
    agentRole: null,
    gitInfo: { branch: "feature/rpc-branch", sha: null, originUrl: null },
    name: overrides?.name ?? "First thread",
    turns: []
  };
}

describe("listAllThreads", () => {
  it("loads all pages from the active thread list", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [createRpcThread()],
        nextCursor: "page-2"
      })
      .mockResolvedValueOnce({
        data: [createRpcThread({ id: "thread-2", updatedAt: 4, name: "Second thread", cwd: "E:/code/project-b" })],
        nextCursor: null
      });

    const result = await listAllThreads({ request }, "windowsNative");

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(1, "thread/list", {
      archived: false,
      cursor: null,
      limit: 100,
      sortKey: "updated_at"
    });
    expect(request).toHaveBeenNthCalledWith(2, "thread/list", {
      archived: false,
      cursor: "page-2",
      limit: 100,
      sortKey: "updated_at"
    });
    expect(result).toEqual([
      {
        id: "thread-1",
        title: "First thread",
        branch: "feature/rpc-branch",
        cwd: "E:/code/project-a",
        archived: false,
        updatedAt: new Date(2_000).toISOString(),
        source: "rpc",
        agentEnvironment: "windowsNative",
        status: "idle",
        activeFlags: [],
        queuedCount: 0
      },
      {
        id: "thread-2",
        title: "Second thread",
        branch: "feature/rpc-branch",
        cwd: "E:/code/project-b",
        archived: false,
        updatedAt: new Date(4_000).toISOString(),
        source: "rpc",
        agentEnvironment: "windowsNative",
        status: "idle",
        activeFlags: [],
        queuedCount: 0
      }
    ]);
  });

  it("loads archived threads when requested", async () => {
    const request = vi.fn().mockResolvedValue({
      data: [createRpcThread({ id: "archived-thread" })],
      nextCursor: null
    });

    const result = await listAllThreads({ request }, "windowsNative", true);

    expect(request).toHaveBeenCalledWith("thread/list", {
      archived: true,
      cursor: null,
      limit: 100,
      sortKey: "updated_at"
    });
    expect(result[0]?.archived).toBe(true);
  });

  it("maps rpc threads using the requested archived flag", () => {
    const thread = createRpcThread();

    expect(mapThreadToSummary(thread, { archived: false, agentEnvironment: "windowsNative" }).archived).toBe(false);
    expect(mapThreadToSummary(thread, { archived: true, agentEnvironment: "windowsNative" }).archived).toBe(true);
  });

  it("maps codex session summaries to local thread summaries", () => {
    expect(
      mapCodexSessionsToThreads([
        {
          id: "local-1",
          title: "修复登录问题",
          cwd: "E:/code/project-a",
          updatedAt: "2026-03-06T10:00:00.000Z",
          agentEnvironment: "windowsNative"
        }
      ])
    ).toEqual([
      {
        id: "local-1",
        title: "修复登录问题",
        branch: null,
        cwd: "E:/code/project-a",
        archived: false,
        updatedAt: "2026-03-06T10:00:00.000Z",
        source: "codexData",
        agentEnvironment: "windowsNative",
        status: "notLoaded",
        activeFlags: [],
        queuedCount: 0
      }
    ]);
  });

  it("deduplicates thread catalogs by id", () => {
    expect(
      mergeThreadCatalogs(
        [{ id: "same", title: "rpc", branch: null, cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "rpc", agentEnvironment: "windowsNative", status: "idle", activeFlags: [], queuedCount: 0 }],
        [{ id: "same", title: "local", branch: null, cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T09:00:00.000Z", source: "codexData", agentEnvironment: "windowsNative", status: "notLoaded", activeFlags: [], queuedCount: 0 }]
      )
    ).toEqual([{ id: "same", title: "rpc", branch: null, cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "rpc", agentEnvironment: "windowsNative", status: "idle", activeFlags: [], queuedCount: 0 }]);
  });

  it("keeps local cwd when rpc entry is missing it", () => {
    expect(
      mergeThreadCatalogs(
        [{ id: "same", title: "rpc", branch: null, cwd: null, archived: false, updatedAt: "2026-03-06T09:00:00.000Z", source: "rpc", agentEnvironment: "windowsNative", status: "idle", activeFlags: [], queuedCount: 0 }],
        [{ id: "same", title: "local", branch: null, cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "codexData", agentEnvironment: "windowsNative", status: "notLoaded", activeFlags: [], queuedCount: 0 }]
      )
    ).toEqual([{ id: "same", title: "rpc", branch: null, cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "rpc", agentEnvironment: "windowsNative", status: "idle", activeFlags: [], queuedCount: 0 }]);
  });
});
