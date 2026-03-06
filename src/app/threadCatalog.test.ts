import { describe, expect, it, vi } from "vitest";
import { listAllThreads, mapCodexSessionsToThreads, mergeThreadCatalogs } from "./threadCatalog";

describe("listAllThreads", () => {
  it("loads all pages from thread list", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "thread-1",
            preview: "first preview",
            ephemeral: false,
            modelProvider: "openai",
            createdAt: 1,
            updatedAt: 2,
            status: { type: "idle" },
            path: null,
            cwd: "E:/code/project-a",
            cliVersion: "0.0.1",
            source: "appServer",
            agentNickname: null,
            agentRole: null,
            gitInfo: null,
            name: "First thread",
            turns: []
          }
        ],
        nextCursor: "page-2"
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "thread-2",
            preview: "second preview",
            ephemeral: false,
            modelProvider: "openai",
            createdAt: 3,
            updatedAt: 4,
            status: { type: "idle" },
            path: null,
            cwd: "E:/code/project-b",
            cliVersion: "0.0.1",
            source: "appServer",
            agentNickname: null,
            agentRole: null,
            gitInfo: null,
            name: "Second thread",
            turns: []
          }
        ],
        nextCursor: null
      });

    const result = await listAllThreads({ request });

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
        cwd: "E:/code/project-a",
        archived: false,
        updatedAt: new Date(2_000).toISOString(),
        source: "rpc",
        status: "idle",
        activeFlags: [],
        queuedCount: 0
      },
      {
        id: "thread-2",
        title: "Second thread",
        cwd: "E:/code/project-b",
        archived: false,
        updatedAt: new Date(4_000).toISOString(),
        source: "rpc",
        status: "idle",
        activeFlags: [],
        queuedCount: 0
      }
    ]);
  });

  it("maps codex session summaries to local thread summaries", () => {
    expect(
      mapCodexSessionsToThreads([
        {
          id: "local-1",
          title: "修复登录问题",
          cwd: "E:/code/project-a",
          updatedAt: "2026-03-06T10:00:00.000Z"
        }
      ])
    ).toEqual([
      {
        id: "local-1",
        title: "修复登录问题",
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

  it("deduplicates thread catalogs by id", () => {
    expect(
      mergeThreadCatalogs(
        [{ id: "same", title: "rpc", cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "rpc", status: "idle", activeFlags: [], queuedCount: 0 }],
        [{ id: "same", title: "local", cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T09:00:00.000Z", source: "codexData", status: "notLoaded", activeFlags: [], queuedCount: 0 }]
      )
    ).toEqual([{ id: "same", title: "rpc", cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "rpc", status: "idle", activeFlags: [], queuedCount: 0 }]);
  });

  it("keeps local cwd when rpc entry is missing it", () => {
    expect(
      mergeThreadCatalogs(
        [{ id: "same", title: "rpc", cwd: null, archived: false, updatedAt: "2026-03-06T09:00:00.000Z", source: "rpc", status: "idle", activeFlags: [], queuedCount: 0 }],
        [{ id: "same", title: "local", cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "codexData", status: "notLoaded", activeFlags: [], queuedCount: 0 }]
      )
    ).toEqual([{ id: "same", title: "rpc", cwd: "E:/code/project-a", archived: false, updatedAt: "2026-03-06T10:00:00.000Z", source: "rpc", status: "idle", activeFlags: [], queuedCount: 0 }]);
  });
});
