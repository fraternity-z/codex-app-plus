import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { I18nProvider } from "../../../i18n/provider";
import { BrowserSidebarPanel } from "./BrowserSidebarPanel";

function rectFor(height: number, top = 120): DOMRect {
  return {
    x: 40,
    y: top,
    top,
    left: 40,
    right: 840,
    bottom: top + height,
    width: 800,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderPanel(hostBridge: HostBridge, wrapInSidebar = false): void {
  const panel = <BrowserSidebarPanel active hostBridge={hostBridge} />;
  render(
    <I18nProvider language="zh-CN" setLanguage={vi.fn()}>
      {wrapInSidebar ? <div className="workspace-diff-sidebar">{panel}</div> : panel}
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BrowserSidebarPanel", () => {
  it("syncs the latest surface bounds after the initial browser open completes", async () => {
    let animationFrame: FrameRequestCallback | null = null;
    let resizeCallback: ResizeObserverCallback | null = null;
    let surfaceHeight = 220;
    let resolveOpen: (() => void) | null = null;
    const openPromise = new Promise<void>((resolve) => {
      resolveOpen = resolve;
    });
    const openBrowserSidebar = vi.fn().mockReturnValue(openPromise);
    const updateBrowserSidebarBounds = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains("workspace-side-browser-surface")) {
        return rectFor(surfaceHeight);
      }
      return rectFor(0);
    });

    renderPanel({
      app: {
        openBrowserSidebar,
        updateBrowserSidebarBounds,
        hideBrowserSidebar: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as HostBridge);

    act(() => {
      animationFrame?.(0);
    });

    expect(openBrowserSidebar).toHaveBeenCalledWith(expect.objectContaining({ height: 220, width: 800 }));

    surfaceHeight = 900;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
      animationFrame?.(16);
    });

    expect(updateBrowserSidebarBounds).not.toHaveBeenCalled();

    await act(async () => {
      resolveOpen?.();
      await openPromise;
    });

    await waitFor(() => {
      expect(updateBrowserSidebarBounds).toHaveBeenCalledWith(expect.objectContaining({ height: 900, width: 800 }));
    });
  });

  it("extends native browser bounds to the side panel bottom when the surface rect is stale", async () => {
    let animationFrame: FrameRequestCallback | null = null;
    const openBrowserSidebar = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains("workspace-side-browser-surface")) {
        return rectFor(220, 120);
      }
      if (this instanceof HTMLElement && this.classList.contains("workspace-diff-sidebar")) {
        return {
          ...rectFor(1000, 0),
          right: 900,
          width: 900,
        } as DOMRect;
      }
      return rectFor(0);
    });

    renderPanel({
      app: {
        openBrowserSidebar,
        updateBrowserSidebarBounds: vi.fn().mockResolvedValue(undefined),
        hideBrowserSidebar: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as HostBridge, true);

    act(() => {
      animationFrame?.(0);
    });

    await waitFor(() => {
      expect(openBrowserSidebar).toHaveBeenCalledWith(expect.objectContaining({ height: 868, width: 800 }));
    });
  });
});
