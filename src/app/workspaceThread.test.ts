import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../domain/types";
import { findLatestThreadForWorkspace, listThreadsForWorkspace } from "./workspaceThread";

const THREADS: Array<ThreadSummary> = [
  {
    id: "thread-1",
    title: "older",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    archived: false,
    updatedAt: "2026-03-06T08:00:00.000Z",
    status: "idle",
    activeFlags: [],
    queuedCount: 0
  },
  {
    id: "thread-2",
    title: "latest",
    branch: null,
    cwd: "E:\\code\\codex-app-plus\\",
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z",
    status: "idle",
    activeFlags: [],
    queuedCount: 0
  },
  {
    id: "thread-3",
    title: "other",
    branch: null,
    cwd: "E:/code/another-workspace",
    archived: false,
    updatedAt: "2026-03-06T10:00:00.000Z",
    status: "idle",
    activeFlags: [],
    queuedCount: 0
  }
];

describe("workspaceThread", () => {
  it("returns the latest thread in the selected workspace", () => {
    expect(findLatestThreadForWorkspace(THREADS, "E:/code/codex-app-plus")).toMatchObject({ id: "thread-2" });
  });

  it("lists workspace threads in descending updatedAt order", () => {
    expect(listThreadsForWorkspace(THREADS, "E:/code/codex-app-plus").map((thread) => thread.id)).toEqual([
      "thread-2",
      "thread-1"
    ]);
  });

  it("returns null when the workspace has no thread", () => {
    expect(findLatestThreadForWorkspace(THREADS, "E:/code/missing")).toBeNull();
  });

  it("includes threads from child directories of the workspace", () => {
    expect(
      listThreadsForWorkspace(
        [
          ...THREADS,
          {
            id: "thread-4",
            title: "frontend",
            branch: null,
            cwd: "E:/code/codex-app-plus/frontend",
            archived: false,
            updatedAt: "2026-03-06T11:00:00.000Z",
            source: "codexData",
            status: "notLoaded",
            activeFlags: [],
            queuedCount: 0
          }
        ],
        "E:/code/codex-app-plus"
      ).map((thread) => thread.id)
    ).toEqual(["thread-4", "thread-2", "thread-1"]);
  });

  it("matches Windows device-prefix paths returned by app-server", () => {
    expect(
      listThreadsForWorkspace(
        [
          {
            id: "thread-5",
            title: "device-prefix",
            branch: null,
            cwd: "\\\\?\\E:\\code\\codex-app-plus",
            archived: false,
            updatedAt: "2026-03-06T12:00:00.000Z",
            status: "idle",
            activeFlags: [],
            queuedCount: 0,
          },
        ],
        "E:/code/codex-app-plus"
      ).map((thread) => thread.id)
    ).toEqual(["thread-5"]);
  });
});
