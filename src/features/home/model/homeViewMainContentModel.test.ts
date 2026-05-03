import { describe, expect, it } from "vitest";
import type { GitStatusOutput, GitWorkspaceDiffOutput } from "../../../bridge/types";
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

describe("createTurnPlanOverview", () => {
  it("prefers the current turn diff snapshot and counts generated images from the same turn", () => {
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
    ];

    const overview = createTurnPlanOverview({
      activities,
      diffItems: [createDiffItem({ additions: 99, deletions: 88 })],
      gitStatus: createGitStatus(),
      plan,
    });

    expect(overview).toEqual({
      additions: 2,
      changedFiles: 1,
      deletions: 1,
      generatedImages: 1,
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
      changedFiles: 1,
      deletions: null,
    });
  });
});
