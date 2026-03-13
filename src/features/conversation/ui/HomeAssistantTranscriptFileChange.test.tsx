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
  it("shows the edited file path for a single-file patch", () => {
    const entry = createFileChangeEntry([
      { path: "src/App.tsx", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
    ]);

    render(<HomeAssistantTranscriptEntry node={{ key: entry.id, kind: "traceItem", item: entry }} />);

    expect(screen.getByText("已编辑 src/App.tsx")).toBeInTheDocument();
  });

  it("shows the first edited file and total count for multi-file patches", () => {
    const entry = createFileChangeEntry([
      { path: "src/App.tsx", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
      { path: "src/styles.css", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" },
    ]);

    render(<HomeAssistantTranscriptEntry node={{ key: entry.id, kind: "traceItem", item: entry }} />);

    expect(screen.getByText("已编辑 src/App.tsx 等 2 个文件")).toBeInTheDocument();
  });
});
