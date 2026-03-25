import { describe, expect, it } from "vitest";
import {
  buildComposerUserInputs,
  createComposerAttachmentsFromPaths,
  partitionComposerPaths,
  resolveMentionAttachmentPath,
} from "./composerAttachments";
import { serializeComposerFileReferenceDraft } from "./composerFileReferences";

describe("composerAttachments", () => {
  it("maps local paths to image and mention attachments", () => {
    const attachments = createComposerAttachmentsFromPaths([
      "E:/code/codex-app-plus/image.png",
      "E:/code/codex-app-plus/notes.md",
    ]);

    expect(attachments).toMatchObject([
      { kind: "image", source: "localImage", name: "image.png", value: "E:/code/codex-app-plus/image.png" },
      { kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" },
    ]);
  });

  it("splits image paths from file paths", () => {
    expect(partitionComposerPaths([
      "E:/code/codex-app-plus/image.png",
      "E:/code/codex-app-plus/notes.md",
    ])).toEqual({
      imagePaths: ["E:/code/codex-app-plus/image.png"],
      filePaths: ["E:/code/codex-app-plus/notes.md"],
    });
  });

  it("builds official user inputs for text, local images, pasted images, and files", () => {
    const inputs = buildComposerUserInputs("inspect these", [
      { id: "image-1", kind: "image", source: "localImage", name: "image.png", value: "E:/code/codex-app-plus/image.png" },
      { id: "image-2", kind: "image", source: "dataUrl", name: "paste.png", value: "data:image/png;base64,aGVsbG8=" },
      { id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" },
    ], "windowsNative");

    expect(inputs).toEqual([
      { type: "text", text: "inspect these", text_elements: [] },
      { type: "localImage", path: "E:/code/codex-app-plus/image.png" },
      { type: "image", url: "data:image/png;base64,aGVsbG8=" },
      { type: "mention", name: "notes.md", path: "E:/code/codex-app-plus/notes.md" },
    ]);
  });

  it("converts local attachment paths for WSL agents", () => {
    const inputs = buildComposerUserInputs("inspect these", [
      { id: "image-1", kind: "image", source: "localImage", name: "image.png", value: "E:/code/codex-app-plus/image.png" },
      { id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" },
    ], "wsl");

    expect(inputs).toEqual([
      { type: "text", text: "inspect these", text_elements: [] },
      { type: "localImage", path: "/mnt/e/code/codex-app-plus/image.png" },
      { type: "mention", name: "notes.md", path: "/mnt/e/code/codex-app-plus/notes.md" },
    ]);
  });

  it("normalizes file URI attachments before building inputs", () => {
    const inputs = buildComposerUserInputs("inspect these", [
      { id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "file:///E:/code/codex-app-plus/notes.md" },
    ], "windowsNative");

    expect(inputs).toEqual([
      { type: "text", text: "inspect these", text_elements: [] },
      { type: "mention", name: "notes.md", path: "E:/code/codex-app-plus/notes.md" },
    ]);
  });

  it("expands hidden file references into text while keeping file mentions", () => {
    const inputs = buildComposerUserInputs(
      serializeComposerFileReferenceDraft("读取文件内容", ["docs/notes.md"]),
      [],
      "windowsNative",
    );

    expect(inputs).toEqual([
      { type: "text", text: "读取文件内容\n\ndocs/notes.md", text_elements: [] },
      { type: "mention", name: "notes.md", path: "docs/notes.md" },
    ]);
  });

  it("resolves mention search results to absolute paths", () => {
    expect(resolveMentionAttachmentPath("E:/code/codex-app-plus", "src/App.tsx")).toBe("E:/code/codex-app-plus/src/App.tsx");
    expect(resolveMentionAttachmentPath("E:/code/codex-app-plus", "E:/code/codex-app-plus/src/App.tsx")).toBe("E:/code/codex-app-plus/src/App.tsx");
  });
});
