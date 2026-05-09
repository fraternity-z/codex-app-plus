import { describe, expect, it } from "vitest";
import { countWorkspaceDiffStats, parseWorkspaceDiffText } from "./workspaceDiffDisplayModel";

describe("workspaceDiffDisplayModel", () => {
  it("parses untracked plain text content as an added file", () => {
    const diff = "first line\nsecond line\n";

    const parsed = parseWorkspaceDiffText(diff, "untracked");

    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.additions).toBe(2);
    expect(parsed.deletions).toBe(0);
    expect(parsed.hunks[0]?.lines[0]).toMatchObject({ kind: "add", content: "first line", newLine: 1 });
    expect(countWorkspaceDiffStats(diff, "untracked")).toEqual({ additions: 2, deletions: 0 });
  });

  it("keeps tracked plain text fallback output raw", () => {
    const parsed = parseWorkspaceDiffText("当前没有可显示的差异。", "unstaged");

    expect(parsed.hunks).toHaveLength(0);
    expect(parsed.additions).toBe(0);
    expect(parsed.deletions).toBe(0);
  });
});
