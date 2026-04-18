import { fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GitDiffCodeView } from "./GitDiffCodeView";

beforeAll(() => {
  class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

describe("GitDiffCodeView", () => {
  it("keeps split panes horizontally synchronized", async () => {
    const { container } = render(
      <GitDiffCodeView
        diff={"@@ -1,2 +1,2 @@\n-const before = 'left';\n+const after = 'right';\n sharedLine();"}
        path="src/example.ts"
        viewStyle="split"
      />,
    );

    const panes = container.querySelectorAll(".workspace-diff-split-pane");
    const rail = container.querySelector(".workspace-diff-code-horizontal-scroll");
    expect(panes).toHaveLength(2);
    expect(rail).not.toBeNull();

    const [leftPane, rightPane] = Array.from(panes) as HTMLDivElement[];
    leftPane.scrollLeft = 120;
    fireEvent.scroll(leftPane);

    expect(rightPane.scrollLeft).toBe(120);
    expect((rail as HTMLDivElement).scrollLeft).toBe(120);

    await Promise.resolve();
    (rail as HTMLDivElement).scrollLeft = 48;
    fireEvent.scroll(rail as HTMLDivElement);

    expect(leftPane.scrollLeft).toBe(48);
    expect(rightPane.scrollLeft).toBe(48);
  });
});
