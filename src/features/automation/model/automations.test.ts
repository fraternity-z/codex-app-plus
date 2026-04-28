import { describe, expect, it } from "vitest";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import {
  AUTOMATION_SECTIONS,
  computeNextRunAt,
  createAutomationRecord,
  getAutomationSectionTemplates,
  isAutomationDue,
  parseAutomationRecords,
  recordAutomationRunResult,
} from "./automations";

const workspaceRoot: WorkspaceRoot = {
  id: "root-1",
  name: "codex-app-plus",
  path: "E:\\code\\codex-app-plus",
};

function expectLocalDate(
  value: Date,
  expected: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
  },
) {
  expect(value.getFullYear()).toBe(expected.year);
  expect(value.getMonth()).toBe(expected.month);
  expect(value.getDate()).toBe(expected.day);
  expect(value.getHours()).toBe(expected.hour);
  expect(value.getMinutes()).toBe(expected.minute);
}

describe("automation scheduling", () => {
  it("schedules the next daily run later on the same day", () => {
    const nextRun = computeNextRunAt(
      { mode: "daily", time: "09:00" },
      new Date(2026, 3, 28, 8, 30),
    );

    expectLocalDate(nextRun, {
      year: 2026,
      month: 3,
      day: 28,
      hour: 9,
      minute: 0,
    });
  });

  it("rolls weekday schedules past the weekend", () => {
    const nextRun = computeNextRunAt(
      { mode: "weekdays", time: "09:00" },
      new Date(2026, 4, 1, 10, 0),
    );

    expectLocalDate(nextRun, {
      year: 2026,
      month: 4,
      day: 4,
      hour: 9,
      minute: 0,
    });
  });

  it("uses the configured weekly weekday", () => {
    const nextRun = computeNextRunAt(
      { mode: "weekly", time: "16:00", weekday: 5 },
      new Date(2026, 3, 28, 10, 0),
    );

    expectLocalDate(nextRun, {
      year: 2026,
      month: 4,
      day: 1,
      hour: 16,
      minute: 0,
    });
  });

  it("creates records with trimmed text and workspace metadata", () => {
    const record = createAutomationRecord(
      {
        name: "  Weekly status  ",
        prompt: "  Summarize the repository  ",
        schedule: { mode: "weekly", time: "16:00", weekday: 5 },
        workspaceRootId: workspaceRoot.id,
      },
      workspaceRoot,
      new Date(2026, 3, 28, 10, 0),
    );

    expect(record).toMatchObject({
      name: "Weekly status",
      prompt: "Summarize the repository",
      workspaceRootId: "root-1",
      workspaceName: "codex-app-plus",
      workspacePath: "E:\\code\\codex-app-plus",
      model: null,
      effort: null,
      serviceTier: null,
      enabled: true,
      lastRunAt: null,
      lastError: null,
    });
    expect(record.id).toMatch(/^automation-\d+-[a-z0-9]+$/);
    expectLocalDate(new Date(record.nextRunAt), {
      year: 2026,
      month: 4,
      day: 1,
      hour: 16,
      minute: 0,
    });
  });

  it("updates run result metadata and computes the following run", () => {
    const record = createAutomationRecord(
      {
        name: "CI monitor",
        prompt: "Check CI",
        schedule: { mode: "daily", time: "21:00" },
        workspaceRootId: workspaceRoot.id,
      },
      workspaceRoot,
      new Date(2026, 3, 28, 10, 0),
    );
    const runAt = new Date(2026, 3, 28, 21, 5);

    const updated = recordAutomationRunResult(record, {
      runAt,
      error: "CI failed",
    });

    expect(updated.lastRunAt).toBe(runAt.toISOString());
    expect(updated.lastError).toBe("CI failed");
    expectLocalDate(new Date(updated.nextRunAt), {
      year: 2026,
      month: 3,
      day: 29,
      hour: 21,
      minute: 0,
    });
  });

  it("parses only valid stored records", () => {
    const record = createAutomationRecord(
      {
        name: "Daily report",
        prompt: "Summarize changes",
        schedule: { mode: "daily", time: "09:00" },
        workspaceRootId: workspaceRoot.id,
      },
      workspaceRoot,
      new Date(2026, 3, 28, 8, 0),
    );

    expect(parseAutomationRecords([record, { id: "missing-required-fields" }])).toEqual([record]);
  });

  it("stores per-automation model and effort selections", () => {
    const record = createAutomationRecord(
      {
        name: "Daily report",
        prompt: "Summarize changes",
        schedule: { mode: "daily", time: "09:00" },
        workspaceRootId: workspaceRoot.id,
        model: "gpt-5.5",
        effort: "high",
        serviceTier: "fast",
      },
      workspaceRoot,
      new Date(2026, 3, 28, 8, 0),
    );

    expect(record).toMatchObject({
      model: "gpt-5.5",
      effort: "high",
      serviceTier: "fast",
    });
    expect(parseAutomationRecords([{ ...record, effort: "invalid", serviceTier: "invalid" }])).toEqual([{
      ...record,
      effort: null,
      serviceTier: null,
    }]);
  });

  it("reports due status only for enabled records whose next run has passed", () => {
    const record = createAutomationRecord(
      {
        name: "Daily report",
        prompt: "Summarize changes",
        schedule: { mode: "daily", time: "09:00" },
        workspaceRootId: workspaceRoot.id,
      },
      workspaceRoot,
      new Date(2026, 3, 28, 8, 0),
    );

    expect(isAutomationDue(record, new Date(2026, 3, 28, 9, 0))).toBe(true);
    expect(isAutomationDue({ ...record, enabled: false }, new Date(2026, 3, 28, 9, 0))).toBe(false);
  });

  it("resolves section template ids to templates", () => {
    const templates = getAutomationSectionTemplates(AUTOMATION_SECTIONS[0]);

    expect(templates.map((template) => template.id)).toEqual([
      "daily-standup",
      "weekly-engineering-summary",
      "weekly-pr-summary",
    ]);
  });
});
