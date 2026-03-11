import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../domain/timeline";
import { extractConnectionRetryInfo } from "./homeConnectionRetry";

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
});
