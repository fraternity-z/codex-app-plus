import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FileChangeEntry } from "../../../domain/timeline";
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
  it("shows only the edited file name for a single-file patch", () => {
    const entry = createFileChangeEntry([
      { path: "/mnt/e/code/codex-app-plus/src/App.tsx", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
    ]);

    render(<HomeAssistantTranscriptEntry node={{ key: entry.id, kind: "traceItem", item: entry }} />);

    const fileName = screen.getByText("App.tsx", { selector: ".home-assistant-transcript-file-name" });
    const detailBody = screen.getByText(
      (_, element) => element?.classList.contains("home-assistant-transcript-detail-body") === true && element.textContent?.includes("App.tsx") === true,
    );

    expect(fileName).toHaveClass("home-assistant-transcript-file-name");
    expect(
      screen.getByText(
        (_, element) => element?.classList.contains("home-assistant-transcript-summary-text") === true && element.textContent === "已编辑 App.tsx",
      ),
    ).toBeInTheDocument();
    expect(detailBody).toHaveTextContent(/变更文件：\s+App\.tsx\s+patched/u);
    expect(detailBody).not.toHaveTextContent("/mnt/e/code/codex-app-plus/src/App.tsx");
    expect(screen.queryByText("/mnt/e/code/codex-app-plus/src/App.tsx")).not.toBeInTheDocument();
  });

  it("shows the first edited file name and total count for multi-file patches", () => {
    const entry = createFileChangeEntry([
      { path: "C:\\workspace\\codex-app-plus\\src\\App.tsx", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
      { path: "C:\\workspace\\codex-app-plus\\src\\styles.css", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
    ]);

    render(<HomeAssistantTranscriptEntry node={{ key: entry.id, kind: "traceItem", item: entry }} />);

    const fileName = screen.getByText("App.tsx", { selector: ".home-assistant-transcript-file-name" });
    const detailBody = screen.getByText(
      (_, element) => element?.classList.contains("home-assistant-transcript-detail-body") === true && element.textContent?.includes("styles.css") === true,
    );

    expect(fileName).toHaveClass("home-assistant-transcript-file-name");
    expect(
      screen.getByText(
        (_, element) =>
          element?.classList.contains("home-assistant-transcript-summary-text") === true &&
          element.textContent === "已编辑 App.tsx 等 2 个文件",
      ),
    ).toBeInTheDocument();
    expect(detailBody).toHaveTextContent(/变更文件：\s+App\.tsx\s+styles\.css\s+patched/u);
    expect(detailBody).not.toHaveTextContent("C:\\workspace\\codex-app-plus\\src\\App.tsx");
    expect(screen.queryByText("C:\\workspace\\codex-app-plus\\src\\App.tsx")).not.toBeInTheDocument();
  });
});
