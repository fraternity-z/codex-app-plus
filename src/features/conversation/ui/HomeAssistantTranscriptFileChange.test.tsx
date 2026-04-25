import { fireEvent, render, screen } from "@testing-library/react";
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
    const details = container.querySelector(".home-assistant-transcript-details > details") as HTMLDetailsElement;
    const summary = container.querySelector("summary.home-assistant-transcript-summary") as HTMLElement;
    const summaryText = container.querySelector(".home-assistant-transcript-summary-text");
    const fileCards = Array.from(container.querySelectorAll(".home-assistant-transcript-file-diff-card"));
    const fileCard = fileCards[0] as HTMLDetailsElement | undefined;
    const fileCardSummary = fileCard?.querySelector("summary") as HTMLElement | null;
    const copyButton = fileCard?.querySelector(".home-assistant-transcript-file-diff-copy") as HTMLButtonElement | null;

    expect(summaryText?.textContent).toBe("已编辑 App.tsx+2-1");
    expect(container.querySelector(".home-assistant-transcript-summary-chevron")).not.toBeNull();
    expect(container.querySelector('[data-variant="fileDiff"]')).not.toBeNull();
    expect(screen.getByText("App.tsx", { selector: ".home-assistant-transcript-file-diff-title" })).toBeInTheDocument();
    expect(screen.getAllByText("+2")).toHaveLength(2);
    expect(screen.getAllByText("-1")).toHaveLength(2);
    expect(fileCards).toHaveLength(1);
    expect((fileCards[0] as HTMLDetailsElement | undefined)?.open).toBe(true);
    expect(screen.queryByText("Patch")).toBeNull();
    expect(screen.getByText("old line", { selector: ".workspace-diff-code-content" })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.classList.contains("workspace-diff-code-content") === true && element.textContent === "new line",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("/mnt/e/code/codex-app-plus/src/App.tsx")).not.toBeInTheDocument();

    expect(details.open).toBe(false);
    fireEvent.click(summary);
    fireEvent(details, new Event("toggle"));
    expect(details.open).toBe(true);
    expect(screen.getByText("已编辑的文件")).toBeInTheDocument();

    fireEvent.click(summary);
    fireEvent(details, new Event("toggle"));
    expect(details.open).toBe(false);
    expect(summaryText?.textContent).toBe("已编辑 App.tsx+2-1");

    expect(fileCardSummary).not.toBeNull();
    expect(fileCard?.open).toBe(true);
    fireEvent.click(fileCardSummary as HTMLElement);
    expect(fileCard?.open).toBe(false);
    fireEvent.click(fileCardSummary as HTMLElement);
    expect(fileCard?.open).toBe(true);

    expect(copyButton).not.toBeNull();
    fireEvent.click(copyButton as HTMLButtonElement);
    expect(fileCard?.open).toBe(true);
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
    const summaryText = container.querySelector(".home-assistant-transcript-summary-text");
    const fileCards = Array.from(container.querySelectorAll(".home-assistant-transcript-file-diff-card"));

    expect(summaryText?.textContent).toBe("已编辑 App.tsx 等 2 个文件+2-2");
    expect(fileCards).toHaveLength(2);
    expect((fileCards[0] as HTMLDetailsElement | undefined)?.open).toBe(true);
    expect((fileCards[1] as HTMLDetailsElement | undefined)?.open).toBe(false);
    expect(screen.getByText("App.tsx", { selector: ".home-assistant-transcript-file-diff-title" })).toBeInTheDocument();
    expect(screen.getByText("styles.css", { selector: ".home-assistant-transcript-file-diff-title" })).toBeInTheDocument();
    expect(screen.getAllByText("已编辑", { selector: ".home-assistant-transcript-file-diff-kind" })).toHaveLength(2);
    expect(screen.queryByText("Patch")).toBeNull();
    expect(screen.queryByText("C:\\workspace\\codex-app-plus\\src\\App.tsx")).not.toBeInTheDocument();
  });
});
