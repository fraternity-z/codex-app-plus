import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../../domain/timeline";
import { extractConnectionRetryInfo, stripConnectionRetryLines } from "./homeConnectionRetry";

function createAgentMessage(id: string, text: string): TimelineEntry {
  return {
    id,
    kind: "agentMessage",
    role: "assistant",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: id,
    text,
    status: "done",
  };
}

function createUserMessage(id: string, text: string): TimelineEntry {
  return {
    id,
    kind: "userMessage",
    role: "user",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: id,
    text,
    status: "done",
    attachments: [],
  };
}

describe("extractConnectionRetryInfo", () => {
  it("filters reconnecting assistant messages and exposes latest progress", () => {
    const activities = [
      createUserMessage("user-1", "ping"),
      createAgentMessage("retry-1", "Reconnecting... 1/5"),
      createAgentMessage("retry-2", "Reconnecting... 3/5"),
      createAgentMessage("assistant-1", "Done"),
    ];

    const result = extractConnectionRetryInfo(activities);

    expect(result.activities.map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
    expect(result.retryInfo).toMatchObject({ attempt: 3, total: 5, sourceEntryId: "retry-2" });
  });

  it("keeps assistant messages that do not match the retry pattern", () => {
    const activities = [
      createAgentMessage("assistant-1", "Reconnected successfully."),
      createAgentMessage("assistant-2", "Reconnecting soon"),
    ];

    const result = extractConnectionRetryInfo(activities);

    expect(result.activities).toHaveLength(2);
    expect(result.retryInfo).toBeNull();
  });

  it("detects unicode ellipsis and full width separators", () => {
    const activities = [
      createAgentMessage("retry-1", "Reconnecting\u2026 4\uFF0F5"),
      createAgentMessage("assistant-1", "continue task"),
    ];

    const result = extractConnectionRetryInfo(activities);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe("assistant-1");
    expect(result.retryInfo).toMatchObject({ attempt: 4, total: 5 });
  });

  it("removes retry lines but keeps assistant content in the same message", () => {
    const activities = [
      createAgentMessage("assistant-1", "Reconnecting... 1/5\n\n继续生成中"),
    ];

    const result = extractConnectionRetryInfo(activities);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      id: "assistant-1",
      text: "继续生成中",
    });
    expect(result.retryInfo).toMatchObject({ attempt: 1, total: 5, sourceEntryId: "assistant-1" });
  });
});

describe("stripConnectionRetryLines", () => {
  it("removes retry-only lines from shell output", () => {
    expect(stripConnectionRetryLines("line 1\nReconnecting... 1/5\n\nline 2")).toBe("line 1\n\nline 2");
  });
});
