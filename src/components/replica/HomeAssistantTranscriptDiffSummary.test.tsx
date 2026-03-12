import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TurnDiffSnapshotEntry } from "../../domain/timeline";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";

describe("HomeAssistantTranscriptEntry turn diff summary", () => {
  it("renders turn diff snapshots as a per-file statistics list", () => {
    const entry: TurnDiffSnapshotEntry = {
      id: "turn-diff-1",
      kind: "turnDiffSnapshot",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: null,
      diff: [
        "diff --git a/src/App.tsx b/src/App.tsx",
        "--- a/src/App.tsx",
        "+++ b/src/App.tsx",
        "@@ -1 +1,2 @@",
        "-old line",
        "+new line",
        "+another line",
        "diff --git a/src/index.css b/src/index.css",
        "--- a/src/index.css",
        "+++ b/src/index.css",
        "@@ -2,2 +2 @@",
        "-alpha",
        "-beta",
        "+gamma",
      ].join("\n"),
    };
    const node = { key: entry.id, kind: "auxiliaryBlock" as const, entry };
    const { container } = render(<HomeAssistantTranscriptEntry node={node} />);
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");

    expect(summary?.textContent).toBe("代码 diff 已更新");
    expect(details?.open).toBe(false);

    if (summary !== null) {
      fireEvent.click(summary);
    }

    expect(details?.open).toBe(true);
    expect(container.querySelector('[data-variant="diffSummary"]')).not.toBeNull();
    expect(screen.getByText("2 个文件已更改")).toBeInTheDocument();
    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("src/index.css")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });
});
