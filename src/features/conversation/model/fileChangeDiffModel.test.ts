import { describe, expect, it } from "vitest";
import { parseFileUpdateChangeDiff } from "./fileChangeDiffModel";

describe("fileChangeDiffModel", () => {
  it("parses direct added file content only when the change kind is add", () => {
    const parsed = parseFileUpdateChangeDiff({
      path: "src/NewFile.ts",
      kind: { type: "add" },
      diff: "export const value = 1;\n",
    });

    expect(parsed?.hunks).toHaveLength(1);
    expect(parsed?.additions).toBe(1);
    expect(parsed?.deletions).toBe(0);
  });

  it("keeps direct content for update changes as raw output", () => {
    const parsed = parseFileUpdateChangeDiff({
      path: "src/ExistingFile.ts",
      kind: { type: "update", move_path: null },
      diff: "export const value = 1;\n",
    });

    expect(parsed?.hunks).toHaveLength(0);
    expect(parsed?.additions).toBe(0);
    expect(parsed?.deletions).toBe(0);
  });
});
