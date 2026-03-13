import { describe, expect, it } from "vitest";
import {
  buildComposerUserInputs,
  createComposerAttachmentsFromPaths,
} from "./composerAttachments";

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

  it("builds official user inputs for text, local images, pasted images, and files", () => {
    const inputs = buildComposerUserInputs("inspect these", [
      { id: "image-1", kind: "image", source: "localImage", name: "image.png", value: "E:/code/codex-app-plus/image.png" },
      { id: "image-2", kind: "image", source: "dataUrl", name: "paste.png", value: "data:image/png;base64,aGVsbG8=" },
      { id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" },
    ]);

    expect(inputs).toEqual([
      { type: "text", text: "inspect these", text_elements: [] },
      { type: "localImage", path: "E:/code/codex-app-plus/image.png" },
      { type: "image", url: "data:image/png;base64,aGVsbG8=" },
      { type: "mention", name: "notes.md", path: "E:/code/codex-app-plus/notes.md" },
    ]);
  });
});
