import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TurnDiffSnapshotEntry } from "../../../domain/timeline";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";

function createTurnDiffEntry(): TurnDiffSnapshotEntry {
  return {
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
}

describe("HomeAssistantTranscriptEntry turn diff summary", () => {
  it("renders the diff file list inline after the turn finishes", () => {
    const entry = createTurnDiffEntry();
    const node = { key: entry.id, kind: "auxiliaryBlock" as const, entry };
    const { container } = render(<HomeAssistantTranscriptEntry node={node} turnStatus="completed" />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("summary")).toBeNull();
    expect(container.querySelector('[data-variant="diffSummary"]')).not.toBeNull();
    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("src/index.css")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("does not render the diff file list while the turn is still running", () => {
    const entry = createTurnDiffEntry();
    const node = { key: entry.id, kind: "auxiliaryBlock" as const, entry };
    const { container } = render(<HomeAssistantTranscriptEntry node={node} turnStatus="inProgress" />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Code diff updated")).toBeNull();
    expect(screen.queryByText("src/App.tsx")).toBeNull();
  });
});
