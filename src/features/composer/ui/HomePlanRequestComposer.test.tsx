import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomePlanRequestComposer } from "./HomePlanRequestComposer";

describe("HomePlanRequestComposer", () => {
  it("submits refine notes when the second option is selected", async () => {
    const onRefine = vi.fn().mockResolvedValue(undefined);
    render(
      <HomePlanRequestComposer
        busy={false}
        onDismiss={vi.fn()}
        onImplement={vi.fn().mockResolvedValue(undefined)}
        onRefine={onRefine}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /否，请告知 Codex 如何调整/ }));
    fireEvent.change(screen.getByPlaceholderText("请告诉 Codex 该如何调整方案"), { target: { value: "把测试拆成两步" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() => expect(onRefine).toHaveBeenCalledWith("把测试拆成两步"));
  });
});
