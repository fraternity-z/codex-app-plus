import { describe, expect, it } from "vitest";
import { parseTurnDiffSummary } from "./turnDiffSummaryModel";

describe("turnDiffSummaryModel", () => {
  it("summarizes multi-file unified diffs by file", () => {
    const summary = parseTurnDiffSummary([
      "diff --git a/src/App.tsx b/src/App.tsx",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1 +1,2 @@",
      "-old line",
      "+new line",
      "+another line",
      "diff --git a/src/index.css b/src/index.css",
      "--- a/src/index.css",
      "+++ b/src/index.css",
      "@@ -2,2 +2 @@",
      "-alpha",
      "-beta",
      "+gamma",
    ].join("\n"));

    expect(summary).toEqual({
      files: [
        { path: "src/App.tsx", additions: 2, deletions: 1 },
        { path: "src/index.css", additions: 1, deletions: 2 },
      ],
      additions: 3,
      deletions: 3,
    });
  });
});
