import { describe, expect, it } from "vitest";
import type { GitStatusOutput, GitWorkspaceDiffOutput } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import type { TimelineEntry } from "../../../domain/timeline";
import { createTurnPlanModel } from "../../conversation/model/homeTurnPlanModel";
import { createTurnPlanOverview } from "./homeViewMainContentModel";

function createDiffItem(overrides?: Partial<GitWorkspaceDiffOutput>): GitWorkspaceDiffOutput {
  return {
    path: "src/App.tsx",
    displayPath: "src/App.tsx",
    originalPath: null,
    status: "M",
    staged: false,
    section: "unstaged",
    diff: "",
    additions: 3,
    deletions: 1,
    ...overrides,
  };
}

function createGitStatus(): GitStatusOutput {
  return {
    isRepository: true,
    repoRoot: "E:/code/codex-app-plus",
    branch: null,
    remoteName: null,
    remoteUrl: null,
    branches: [],
    staged: [],
    unstaged: [{
      path: "src/App.tsx",
      originalPath: null,
      indexStatus: " ",
      worktreeStatus: "M",
    }],
    untracked: [],
    conflicted: [],
    isClean: false,
  };
}

function createPlanEntry(): Extract<TimelineEntry, { kind: "turnPlanSnapshot" }> {
  return {
    id: "thread-1:turn-1:turnPlan",
    kind: "turnPlanSnapshot",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: null,
    explanation: null,
    plan: [{ step: "Build UI", status: "inProgress" }],
  };
}

function createThreadSummary(overrides?: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-agent",
    title: "Meitner",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    archived: false,
    updatedAt: "2026-04-18T12:00:00.000Z",
    source: "rpc",
    isSubagent: true,
    agentNickname: "Meitner",
    agentRole: "explorer",
    agentEnvironment: "windowsNative",
    status: "active",
    activeFlags: [],
    queuedCount: 0,
    ...overrides,
  };
}

describe("createTurnPlanOverview", () => {
  it("prefers the current turn diff snapshot and collects generated results from the same turn", () => {
    const plan = createTurnPlanModel(createPlanEntry());
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "thread-1:turn-0:image",
        kind: "imageGeneration",
        threadId: "thread-1",
        turnId: "turn-0",
        itemId: "image-0",
        status: "completed",
        revisedPrompt: null,
        result: "base64",
        savedPath: null,
      },
      {
        id: "thread-1:turn-1:diff",
        kind: "turnDiffSnapshot",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: null,
        diff: [
          "diff --git a/src/App.tsx b/src/App.tsx",
          "--- a/src/App.tsx",
          "+++ b/src/App.tsx",
          "@@ -1,2 +1,3 @@",
          " keep",
          "-old",
          "+new",
          "+added",
        ].join("\n"),
      },
      {
        id: "thread-1:turn-1:image",
        kind: "imageGeneration",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "image-1",
        status: "completed",
        revisedPrompt: null,
        result: "",
        savedPath: "E:/code/output/image.png",
      },
      {
        id: "thread-1:turn-1:fileChange",
        kind: "fileChange",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "file-change-1",
        changes: [{
          path: "docs/report.pdf",
          kind: { type: "add" },
          diff: "",
        }],
        status: "completed",
        output: "",
        approvalRequestId: null,
      },
    ];

    const overview = createTurnPlanOverview({
      activities,
      diffItems: [createDiffItem({ additions: 99, deletions: 88 })],
      gitStatus: createGitStatus(),
      plan,
      workspacePath: "E:/code/codex-app-plus",
    });

    expect(overview).toEqual({
      additions: 2,
      backgroundTasks: [],
      changedFiles: 1,
      deletions: 1,
      generatedResults: [
        {
          id: "thread-1:turn-1:image",
          target: {
            kind: "file",
            fileKind: "image",
            path: "E:/code/output/image.png",
            name: "image.png",
            extension: "PNG",
          },
        },
        {
          id: "thread-1:turn-1:fileChange:docs/report.pdf",
          target: {
            kind: "file",
            fileKind: "document",
            path: "E:/code/codex-app-plus/docs/report.pdf",
            name: "report.pdf",
            extension: "PDF",
          },
        },
      ],
    });
  });

  it("falls back to sidebar diff items and then git status counts", () => {
    const diffOverview = createTurnPlanOverview({
      activities: [],
      diffItems: [createDiffItem(), createDiffItem({ path: "src/main.tsx", additions: 4, deletions: 2 })],
      gitStatus: createGitStatus(),
      plan: null,
    });

    expect(diffOverview.additions).toBe(7);
    expect(diffOverview.deletions).toBe(3);
    expect(diffOverview.changedFiles).toBe(2);

    const statusOverview = createTurnPlanOverview({
      activities: [],
      diffItems: [],
      gitStatus: createGitStatus(),
      plan: null,
    });

    expect(statusOverview).toMatchObject({
      additions: null,
      backgroundTasks: [],
      changedFiles: 1,
      deletions: null,
    });
  });

  it("lists running commands and active subagents from the plan turn", () => {
    const plan = createTurnPlanModel(createPlanEntry());
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "thread-1:turn-1:command",
        kind: "commandExecution",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "command-1",
        command: "pnpm test",
        cwd: "E:/code/codex-app-plus",
        processId: "proc-1",
        status: "inProgress",
        commandActions: [],
        output: "",
        exitCode: null,
        durationMs: null,
        terminalInteractions: [],
        approvalRequestId: null,
      },
      {
        id: "thread-1:turn-1:agent",
        kind: "collabAgentToolCall",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "agent-1",
        tool: "spawnAgent",
        status: "completed",
        senderThreadId: "thread-1",
        receiverThreadIds: ["thread-agent"],
        prompt: "inspect the UI",
        agentsStates: {
          "thread-agent": { status: "running", message: null },
        },
      },
      {
        id: "thread-1:turn-0:command",
        kind: "commandExecution",
        threadId: "thread-1",
        turnId: "turn-0",
        itemId: "command-old",
        command: "pnpm build",
        cwd: "E:/code/codex-app-plus",
        processId: "proc-old",
        status: "inProgress",
        commandActions: [],
        output: "",
        exitCode: null,
        durationMs: null,
        terminalInteractions: [],
        approvalRequestId: null,
      },
    ];

    const overview = createTurnPlanOverview({
      activities,
      diffItems: [],
      gitStatus: null,
      plan,
      threads: [createThreadSummary()],
    });

    expect(overview.backgroundTasks).toEqual([
      { id: "thread-1:turn-1:command", kind: "command", label: "pnpm test" },
      { id: "thread-1:turn-1:agent:thread-agent", kind: "subagent", label: "Meitner", detail: "explorer", threadId: "thread-agent" },
    ]);
  });
});
