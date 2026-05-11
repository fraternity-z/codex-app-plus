import { describe, expect, it } from "vitest";
import { extractQuickPreviewTargets } from "./previewTargets";

describe("previewTargets", () => {
  it("extracts local website and previewable files from assistant text", () => {
    const targets = extractQuickPreviewTargets(
      "预览地址还是：http://127.0.0.1:5174/design#structure-video\nWord 在根目录：网站设计报告.docx。",
      "E:/code/codex-app-plus",
    );

    expect(targets).toEqual([
      { kind: "website", url: "http://127.0.0.1:5174/design#structure-video" },
      {
        kind: "file",
        fileKind: "document",
        path: "E:/code/codex-app-plus/网站设计报告.docx",
        name: "网站设计报告.docx",
        extension: "DOCX",
      },
    ]);
  });

  it("does not create cards for external websites or code files", () => {
    const targets = extractQuickPreviewTargets(
      "参考 https://example.com，修改 src/App.tsx，并输出 diagram.png。",
      "E:/code/codex-app-plus",
    );

    expect(targets).toEqual([
      {
        kind: "file",
        fileKind: "image",
        path: "E:/code/codex-app-plus/diagram.png",
        name: "diagram.png",
        extension: "PNG",
      },
    ]);
  });

  it("ignores preview-looking paths inside fenced code blocks", () => {
    const targets = extractQuickPreviewTargets(
      "```text\nfake.docx\nhttp://localhost:3000\n```\n实际文件：result.pdf",
      "E:/code/codex-app-plus",
    );

    expect(targets).toEqual([
      {
        kind: "file",
        fileKind: "document",
        path: "E:/code/codex-app-plus/result.pdf",
        name: "result.pdf",
        extension: "PDF",
      },
    ]);
  });

  it("ignores malformed bracketed names and JSX attribute fragments", () => {
    const targets = extractQuickPreviewTargets(
      "误写成：[外观设计专利请求书.docx\n验证输出里有 src={git.svg。",
      "E:/code/codex-app-plus",
    );

    expect(targets).toEqual([]);
  });
});
