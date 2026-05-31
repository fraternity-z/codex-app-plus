import { beforeEach, describe, expect, it } from "vitest";
import {
  createGoalSubmissionHistoryEntry,
  GOAL_SUBMISSION_HISTORY_STORAGE_KEY,
  readGoalSubmissionHistory,
  saveGoalSubmissionHistoryEntry,
} from "./goalSubmissionHistory";

describe("goalSubmissionHistory", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists goal submission objectives per thread", () => {
    const first = createGoalSubmissionHistoryEntry("thread-1", "finish the migration", 20);
    const second = createGoalSubmissionHistoryEntry("thread-1", "stabilize long task mode", 10);
    const otherThread = createGoalSubmissionHistoryEntry("thread-2", "ignore this", 15);

    saveGoalSubmissionHistoryEntry(first);
    saveGoalSubmissionHistoryEntry(second);
    saveGoalSubmissionHistoryEntry(otherThread);

    expect(readGoalSubmissionHistory("thread-1")).toEqual([
      expect.objectContaining({ threadId: "thread-1", objective: "stabilize long task mode", createdAtMs: 10 }),
      expect.objectContaining({ threadId: "thread-1", objective: "finish the migration", createdAtMs: 20 }),
    ]);
  });

  it("persists optional goal submission inputs", () => {
    const entry = createGoalSubmissionHistoryEntry(
      "thread-1",
      "inspect the screenshot",
      20,
      [
        { type: "text", text: "inspect the screenshot", text_elements: [] },
        { type: "image", url: "data:image/png;base64,aGVsbG8=" },
      ],
    );

    saveGoalSubmissionHistoryEntry(entry);

    expect(readGoalSubmissionHistory("thread-1")).toEqual([
      expect.objectContaining({
        objective: "inspect the screenshot",
        input: [
          { type: "text", text: "inspect the screenshot", text_elements: [] },
          { type: "image", url: "data:image/png;base64,aGVsbG8=" },
        ],
      }),
    ]);
  });

  it("ignores corrupt stored data", () => {
    window.localStorage.setItem(GOAL_SUBMISSION_HISTORY_STORAGE_KEY, "{broken");

    expect(readGoalSubmissionHistory("thread-1")).toEqual([]);
  });
});
