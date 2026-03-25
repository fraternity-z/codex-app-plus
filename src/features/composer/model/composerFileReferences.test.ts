import { describe, expect, it } from "vitest";
import {
  appendComposerFileReferencePaths,
  expandComposerFileReferenceDraft,
  parseComposerFileReferenceDraft,
  removeComposerFileReferencePath,
  serializeComposerFileReferenceDraft,
  toComposerFileReferencePath,
} from "./composerFileReferences";

describe("composerFileReferences", () => {
  it("serializes hidden file reference markers and restores them for display", () => {
    const raw = serializeComposerFileReferenceDraft("read this", ["docs/notes.md"]);

    expect(parseComposerFileReferenceDraft(raw)).toEqual({
      bodyText: "read this",
      filePaths: ["docs/notes.md"],
    });
  });

  it("expands file reference markers into plain text for submission", () => {
    const raw = serializeComposerFileReferenceDraft("read this", ["docs/notes.md"]);

    expect(expandComposerFileReferenceDraft(raw)).toBe("read this\n\ndocs/notes.md");
  });

  it("appends and removes managed file reference paths", () => {
    const appended = appendComposerFileReferencePaths("", ["docs/notes.md", "docs/notes.md"]);
    expect(parseComposerFileReferenceDraft(appended).filePaths).toEqual(["docs/notes.md"]);

    const removed = removeComposerFileReferencePath(appended, "docs/notes.md");
    expect(parseComposerFileReferenceDraft(removed)).toEqual({
      bodyText: "",
      filePaths: [],
    });
  });

  it("converts workspace file paths to relative references", () => {
    expect(
      toComposerFileReferencePath(
        "E:/code/codex-app-plus/docs/notes.md",
        "E:/code/codex-app-plus",
      ),
    ).toBe("docs/notes.md");
  });
});
