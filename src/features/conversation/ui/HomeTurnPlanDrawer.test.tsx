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
  it("renders the progress card with overview sections when expanded", () => {
    const plan = createTurnPlanModel(createPlanEntry());
    render(
      <HomeTurnPlanDrawer
        plan={plan}
        overview={{ additions: 12, changedFiles: 2, deletions: 4, generatedImages: 1 }}
        pinned={false}
        visible
        onTogglePinned={() => undefined}
      />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    expect(screen.getByRole("region", { name: "Progress card" })).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("Prepare UI")).toBeInTheDocument();
    expect(screen.getByLabelText("Prepare UI: In progress")).toBeInTheDocument();
    expect(screen.getByText("Wire data")).toBeInTheDocument();
    expect(screen.getByLabelText("Wire data: Completed")).toBeInTheDocument();
    expect(screen.getByText("Branch details")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-4")).toBeInTheDocument();
    expect(screen.getByText("Git operations")).toBeInTheDocument();
    expect(screen.getByText("GitHub CLI not authenticated")).toBeInTheDocument();
    expect(screen.getByText("Generated results")).toBeInTheDocument();
    expect(screen.getByText("1 generated image(s)")).toBeInTheDocument();
  });

  it("shows empty state when plan is cleared", () => {
    const plan = createTurnPlanModel(createPlanEntry({ plan: [], explanation: null, id: "plan-empty" }));
    render(<HomeTurnPlanDrawer plan={plan} pinned={false} visible onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.getByText("Task list cleared, waiting for a new plan")).toBeInTheDocument();
  });

  it("invokes toggle handler when pressing the pin button", () => {
    const onToggle = vi.fn();
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-pinned" }));
    render(<HomeTurnPlanDrawer plan={plan} pinned={false} visible onTogglePinned={onToggle} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    fireEvent.click(screen.getByRole("button", { name: "Pin progress card" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("marks the card as pinned when fixed open", () => {
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-fixed" }));
    const { container } = render(
      <HomeTurnPlanDrawer plan={plan} pinned visible onTogglePinned={() => undefined} />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    expect(container.querySelector(".home-turn-progress-card-pinned")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Unpin progress card" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the card without a current plan when a conversation is visible", () => {
    render(<HomeTurnPlanDrawer plan={null} pinned={false} visible onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.getByRole("region", { name: "Progress card" })).toBeInTheDocument();
    expect(screen.getByText("Longer replies will show progress")).toBeInTheDocument();
    expect(screen.getByText("Branch details")).toBeInTheDocument();
  });

  it("stays hidden in the new conversation empty state", () => {
    render(<HomeTurnPlanDrawer plan={null} pinned={false} visible={false} onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.queryByRole("region", { name: "Progress card" })).toBeNull();
  });
});
