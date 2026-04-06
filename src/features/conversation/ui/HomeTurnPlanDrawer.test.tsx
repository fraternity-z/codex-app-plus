import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TurnPlanSnapshotEntry } from "../../../domain/timeline";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { createTurnPlanModel } from "../model/homeTurnPlanModel";
import { HomeTurnPlanDrawer } from "./HomeTurnPlanDrawer";

function createPlanEntry(overrides?: Partial<TurnPlanSnapshotEntry>): TurnPlanSnapshotEntry {
  return {
    id: "plan-test",
    kind: "turnPlanSnapshot",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    explanation: "Track the key steps",
    plan: [
      { step: "Prepare UI", status: "inProgress" },
      { step: "Wire data", status: "completed" },
    ],
    ...overrides,
  } satisfies TurnPlanSnapshotEntry;
}

describe("HomeTurnPlanDrawer", () => {
  it("renders task list with statuses when expanded", () => {
    const plan = createTurnPlanModel(createPlanEntry());
    render(<HomeTurnPlanDrawer plan={plan} collapsed={false} onToggle={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.getByText("Task list")).toBeInTheDocument();
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
    expect(screen.getByText("Prepare UI")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Wire data")).toBeInTheDocument();
    expect(screen.getAllByText("Completed")).not.toHaveLength(0);
  });

  it("shows empty state when plan is cleared", () => {
    const plan = createTurnPlanModel(createPlanEntry({ plan: [], explanation: null, id: "plan-empty" }));
    render(<HomeTurnPlanDrawer plan={plan} collapsed={false} onToggle={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.getByText("Task list cleared, waiting for a new plan")).toBeInTheDocument();
  });

  it("invokes toggle handler when pressing the handle", () => {
    const onToggle = vi.fn();
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-collapsed" }));
    render(<HomeTurnPlanDrawer plan={plan} collapsed onToggle={onToggle} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    fireEvent.click(screen.getByRole("button", { name: /Task list/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
