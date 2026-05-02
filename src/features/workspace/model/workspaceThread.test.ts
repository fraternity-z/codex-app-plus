import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../../../domain/types";
import {
  findLatestThreadForWorkspace,
  listThreadsForWorkspace,
  listWorkspaceSessionCleanupCandidates,
  parseSessionRetentionDays,
} from "./workspaceThread";

const THREADS: Array<ThreadSummary> = [
  {
    id: "thread-1",
    title: "older",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    archived: false,
    updatedAt: "2026-03-06T08:00:00.000Z",
    agentEnvironment: "windowsNative",
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
    agentEnvironment: "windowsNative",
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
    agentEnvironment: "windowsNative",
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

  it("filters subagent threads from workspace session lists", () => {
    expect(
      listThreadsForWorkspace(
        [
          ...THREADS,
          {
            id: "thread-subagent",
            title: "worker",
            branch: null,
            cwd: "E:/code/codex-app-plus",
            archived: false,
            updatedAt: "2026-03-06T12:00:00.000Z",
            source: "rpc",
            isSubagent: true,
            agentNickname: "Atlas",
            agentRole: "worker",
            agentEnvironment: "windowsNative",
            status: "idle",
            activeFlags: [],
            queuedCount: 0,
          },
        ],
        "E:/code/codex-app-plus"
      ).map((thread) => thread.id)
    ).toEqual(["thread-2", "thread-1"]);
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
            agentEnvironment: "windowsNative",
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
            agentEnvironment: "windowsNative",
            status: "idle",
            activeFlags: [],
            queuedCount: 0,
          },
        ],
        "E:/code/codex-app-plus"
      ).map((thread) => thread.id)
    ).toEqual(["thread-5"]);
  });

  it("matches WSL mount paths against Windows workspace roots", () => {
    expect(
      listThreadsForWorkspace(
        [
          {
            id: "thread-6",
            title: "wsl-mount",
            branch: null,
            cwd: "/mnt/e/code/codex-app-plus",
            archived: false,
            updatedAt: "2026-03-06T13:00:00.000Z",
            agentEnvironment: "windowsNative",
            status: "idle",
            activeFlags: [],
            queuedCount: 0,
          },
        ],
        "E:/code/codex-app-plus"
      ).map((thread) => thread.id)
    ).toEqual(["thread-6"]);
  });

  it("matches Linux paths against WSL UNC workspace roots", () => {
    expect(
      listThreadsForWorkspace(
        [
          {
            id: "thread-7",
            title: "wsl-home",
            branch: null,
            cwd: "/home/me/codex-app-plus",
            archived: false,
            updatedAt: "2026-03-06T14:00:00.000Z",
            agentEnvironment: "windowsNative",
            status: "idle",
            activeFlags: [],
            queuedCount: 0,
          },
        ],
        "\\\\wsl.localhost\\Ubuntu\\home\\me\\codex-app-plus"
      ).map((thread) => thread.id)
    ).toEqual(["thread-7"]);
  });

  it("parses retention days from whole-number input", () => {
    expect(parseSessionRetentionDays(" 7 ")).toBe(7);
    expect(parseSessionRetentionDays("0")).toBe(0);
    expect(parseSessionRetentionDays("1.5")).toBeNull();
    expect(parseSessionRetentionDays("-1")).toBeNull();
    expect(parseSessionRetentionDays("days")).toBeNull();
  });

  it("selects workspace cleanup candidates older than the retention window", () => {
    const nowMs = Date.parse("2026-03-10T00:00:00.000Z");

    expect(
      listWorkspaceSessionCleanupCandidates(
        [
          {
            ...THREADS[0]!,
            id: "thread-old",
            updatedAt: "2026-03-06T08:00:00.000Z",
          },
          {
            ...THREADS[1]!,
            id: "thread-recent",
            updatedAt: "2026-03-08T08:00:00.000Z",
          },
          {
            ...THREADS[2]!,
            id: "thread-other",
            updatedAt: "2026-03-01T08:00:00.000Z",
          },
          {
            id: "thread-invalid",
            title: "invalid timestamp",
            branch: null,
            cwd: "E:/code/codex-app-plus",
            archived: false,
            updatedAt: "not-a-date",
            source: "codexData",
            agentEnvironment: "windowsNative",
            status: "notLoaded",
            activeFlags: [],
            queuedCount: 0,
          },
          {
            ...THREADS[0]!,
            id: "thread-old-subagent",
            updatedAt: "2026-03-01T08:00:00.000Z",
            isSubagent: true,
          },
        ],
        "E:/code/codex-app-plus",
        3,
        nowMs,
      ).map((thread) => thread.id)
    ).toEqual(["thread-old"]);
  });
});
