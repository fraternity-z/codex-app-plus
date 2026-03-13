import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TurnPlanSnapshotEntry } from "../../../domain/timeline";
import { HomeTurnPlanDrawer } from "./HomeTurnPlanDrawer";
import { createTurnPlanModel } from "../model/homeTurnPlanModel";

function createPlanEntry(overrides?: Partial<TurnPlanSnapshotEntry>): TurnPlanSnapshotEntry {
  return {
    id: "plan-test",
    kind: "turnPlanSnapshot",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    explanation: "记录关键步骤",
    plan: [
      { step: "准备 UI", status: "inProgress" },
      { step: "联调数据", status: "completed" },
    ],
    ...overrides,
  } satisfies TurnPlanSnapshotEntry;
}

describe("HomeTurnPlanDrawer", () => {
  it("renders task list with statuses when expanded", () => {
    const plan = createTurnPlanModel(createPlanEntry());
    render(<HomeTurnPlanDrawer plan={plan} collapsed={false} onToggle={() => undefined} />);

    expect(screen.getByText("任务清单")).toBeInTheDocument();
    expect(screen.getByText("共 2 个任务")).toBeInTheDocument();
    expect(screen.getByText("准备 UI")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("联调数据")).toBeInTheDocument();
    expect(screen.getAllByText("已完成")).not.toHaveLength(0);
  });

  it("shows empty state when plan is cleared", () => {
    const plan = createTurnPlanModel(createPlanEntry({ plan: [], explanation: null, id: "plan-empty" }));
    render(<HomeTurnPlanDrawer plan={plan} collapsed={false} onToggle={() => undefined} />);

    expect(screen.getByText("任务已清空，等待新计划")).toBeInTheDocument();
  });

  it("invokes toggle handler when pressing the handle", () => {
    const onToggle = vi.fn();
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-collapsed" }));
    render(<HomeTurnPlanDrawer plan={plan} collapsed onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: /任务清单/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
