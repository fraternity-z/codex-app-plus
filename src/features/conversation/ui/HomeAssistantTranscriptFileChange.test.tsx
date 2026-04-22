import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FileChangeEntry } from "../../../domain/timeline";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";

function createFileChangeEntry(changes: FileChangeEntry["changes"]): FileChangeEntry {
  return {
    id: "file-change-1",
    kind: "fileChange",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-file-change",
    changes,
    status: "completed",
    output: "patched",
    approvalRequestId: null,
  };
}

describe("HomeAssistantTranscriptEntry file change summary", () => {
  it("shows a structured diff card for a single edited file", () => {
    const entry = createFileChangeEntry([
      {
        path: "/mnt/e/code/codex-app-plus/src/App.tsx",
        kind: { type: "update", move_path: null },
        diff: ["@@ -1 +1,2 @@", "-old line", "+new line", "+another line"].join("\n"),
      },
    ]);

    const { container } = render(<HomeAssistantTranscriptEntry node={{ key: entry.id, kind: "traceItem", item: entry }} />, {
      wrapper: createI18nWrapper(),
    });

    const fileName = screen.getByText("App.tsx", { selector: ".home-assistant-transcript-file-name" });

    expect(fileName).toHaveClass("home-assistant-transcript-file-name");
    expect(
      screen.getByText(
        (_, element) => element?.classList.contains("home-assistant-transcript-summary-text") === true && element.textContent === "已编辑 App.tsx",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-variant="fileDiff"]')).not.toBeNull();
    expect(screen.getByText("App.tsx", { selector: ".workspace-diff-preview-title" })).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.getByText("old line", { selector: ".workspace-diff-code-content" })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.classList.contains("workspace-diff-code-content") === true && element.textContent === "new line",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("/mnt/e/code/codex-app-plus/src/App.tsx")).not.toBeInTheDocument();
  });

  it("shows one diff card per edited file for multi-file patches", () => {
    const entry = createFileChangeEntry([
      {
        path: "C:\\workspace\\codex-app-plus\\src\\App.tsx",
        kind: { type: "update", move_path: null },
        diff: ["@@ -1 +1 @@", "-alpha", "+beta"].join("\n"),
      },
      {
        path: "C:\\workspace\\codex-app-plus\\src\\styles.css",
        kind: { type: "update", move_path: null },
        diff: ["@@ -1 +1 @@", "-body {}", "+body { color: red; }"].join("\n"),
      },
    ]);

    const { container } = render(<HomeAssistantTranscriptEntry node={{ key: entry.id, kind: "traceItem", item: entry }} />, {
      wrapper: createI18nWrapper(),
    });

    const fileName = screen.getByText("App.tsx", { selector: ".home-assistant-transcript-file-name" });

    expect(fileName).toHaveClass("home-assistant-transcript-file-name");
    expect(
      screen.getByText(
        (_, element) =>
          element?.classList.contains("home-assistant-transcript-summary-text") === true &&
          element.textContent === "已编辑 App.tsx 等 2 个文件",
      ),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".home-assistant-transcript-file-diff-card")).toHaveLength(2);
    expect(screen.getByText("App.tsx", { selector: ".workspace-diff-preview-title" })).toBeInTheDocument();
    expect(screen.getByText("styles.css", { selector: ".workspace-diff-preview-title" })).toBeInTheDocument();
    expect(screen.queryByText("C:\\workspace\\codex-app-plus\\src\\App.tsx")).not.toBeInTheDocument();
  });
});
