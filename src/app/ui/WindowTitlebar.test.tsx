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

  it("omits the app brand from the titlebar", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<WindowTitlebar hostBridge={createHostBridge(controlWindow)} />);

    expect(screen.queryByText("Codex App Plus")).toBeNull();
    expect(container.querySelector(".window-titlebar-logo")).toBeNull();
  });

  it("toggles the active sidebar from the titlebar", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);
    const onToggle = vi.fn();

    render(
      <WindowTitlebar
        hostBridge={createHostBridge(controlWindow)}
        sidebarControl={{
          collapsed: false,
          collapseLabel: "折叠工作区侧边栏",
          expandLabel: "展开工作区侧边栏",
          onToggle,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "折叠工作区侧边栏" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(controlWindow).not.toHaveBeenCalled();
  });

  it("renders back and forward navigation buttons", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();

    render(
      <WindowTitlebar
        hostBridge={createHostBridge(controlWindow)}
        navigationControl={{
          canGoBack: true,
          canGoForward: false,
          onGoBack,
          onGoForward,
        }}
      />,
    );

    const backButton = screen.getByRole("button", { name: "返回上一页" });
    const forwardButton = screen.getByRole("button", { name: "前进到下一页" });

    expect(backButton).toBeEnabled();
    expect(forwardButton).toBeDisabled();

    fireEvent.click(backButton);
    fireEvent.click(forwardButton);

    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).not.toHaveBeenCalled();
  });

  it("starts dragging when pressing the titlebar content", () => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    const controlWindow = vi.fn().mockResolvedValue(undefined);
    const startWindowDragging = vi.fn().mockResolvedValue(undefined);

    const { container } = render(<WindowTitlebar hostBridge={createHostBridge(controlWindow, startWindowDragging)} />);

    const titlebar = container.querySelector(".window-titlebar");
    expect(titlebar).not.toBeNull();
    fireEvent.mouseDown(titlebar as Element, { button: 0, detail: 1 });

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

    const { container } = render(<WindowTitlebar hostBridge={createHostBridge(controlWindow)} />);

    const titlebar = container.querySelector(".window-titlebar");
    expect(titlebar).not.toBeNull();
    fireEvent.doubleClick(titlebar as Element);

    expect(controlWindow).toHaveBeenCalledWith("toggleMaximize");
  });
});
