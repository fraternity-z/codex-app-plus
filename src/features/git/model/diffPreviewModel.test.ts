import { describe, expect, it } from "vitest";
import { collapseDiffRows, parsePlainTextFileDiff, parseUnifiedDiff } from "./diffPreviewModel";

describe("diffPreviewModel", () => {
  it("parses unified diff hunks and change counts", () => {
    const parsed = parseUnifiedDiff([
      "diff --git a/src/App.tsx b/src/App.tsx",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1,3 +1,4 @@",
      " line 1",
      "-line 2",
      "+line 2 updated",
      "+line 3 added",
      " line 4"
    ].join("\n"));

    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.additions).toBe(2);
    expect(parsed.deletions).toBe(1);
    expect(parsed.hunks[0]?.lines[1]?.oldLine).toBe(2);
    expect(parsed.hunks[0]?.lines[2]?.newLine).toBe(2);
  });

  it("collapses long context blocks around changes", () => {
    const parsed = parseUnifiedDiff([
      "@@ -1,11 +1,11 @@",
      " line 1",
      " line 2",
      " line 3",
      " line 4",
      " line 5",
      " line 6",
      " line 7",
      "-line 8",
      "+line 8 updated",
      " line 9",
      " line 8",
      " line 10"
    ].join("\n"));

    const rows = collapseDiffRows(parsed.hunks[0]?.lines ?? []);

    expect(rows.some((row) => row.kind === "collapsed")).toBe(true);
    expect(rows.filter((row) => row.kind === "collapsed")[0]).toMatchObject({ count: 4 });
  });

  it("creates a structured diff for plain text added file content", () => {
    const parsed = parsePlainTextFileDiff("import { test } from \"vitest\";\n\ntest(\"works\", () => {});\n", "add");

    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.additions).toBe(3);
    expect(parsed.deletions).toBe(0);
    expect(parsed.hunks[0]?.lines).toEqual([
      { kind: "add", content: "import { test } from \"vitest\";", oldLine: null, newLine: 1 },
      { kind: "add", content: "", oldLine: null, newLine: 2 },
      { kind: "add", content: "test(\"works\", () => {});", oldLine: null, newLine: 3 },
    ]);
  });
});
