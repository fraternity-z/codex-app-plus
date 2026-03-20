import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import { WindowTitlebar } from "./WindowTitlebar";

function createHostBridge(
  controlWindow: ReturnType<typeof vi.fn>,
  startWindowDragging: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
): HostBridge {
  return {
    app: {
      startWindowDragging,
      controlWindow,
    },
  } as unknown as HostBridge;
}

describe("WindowTitlebar", () => {
  const originalPlatform = navigator.platform;

  afterEach(() => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("renders on Windows and forwards button actions", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);

    render(<WindowTitlebar hostBridge={createHostBridge(controlWindow)} />);

    fireEvent.click(screen.getByRole("button", { name: "最小化窗口" }));
    fireEvent.click(screen.getByRole("button", { name: "最大化或还原窗口" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭窗口" }));

    expect(controlWindow).toHaveBeenNthCalledWith(1, "minimize");
    expect(controlWindow).toHaveBeenNthCalledWith(2, "toggleMaximize");
    expect(controlWindow).toHaveBeenNthCalledWith(3, "close");
  });

  it("starts dragging when pressing the titlebar content", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);
    const startWindowDragging = vi.fn().mockResolvedValue(undefined);

    render(<WindowTitlebar hostBridge={createHostBridge(controlWindow, startWindowDragging)} />);

    fireEvent.mouseDown(screen.getByText("Codex App Plus"), { button: 0, detail: 1 });

    expect(startWindowDragging).toHaveBeenCalledTimes(1);
  });

  it("does not start dragging from window controls", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);
    const startWindowDragging = vi.fn().mockResolvedValue(undefined);

    render(<WindowTitlebar hostBridge={createHostBridge(controlWindow, startWindowDragging)} />);

    fireEvent.mouseDown(screen.getByRole("button", { name: "关闭窗口" }), { button: 0, detail: 1 });

    expect(startWindowDragging).not.toHaveBeenCalled();
  });

  it("toggles maximize on titlebar double click", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win64",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);

    render(<WindowTitlebar hostBridge={createHostBridge(controlWindow)} />);

    fireEvent.doubleClick(screen.getByText("Codex App Plus"));

    expect(controlWindow).toHaveBeenCalledWith("toggleMaximize");
  });
});
