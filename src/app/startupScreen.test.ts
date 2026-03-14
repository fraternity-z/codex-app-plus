import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissStartupScreen } from "./startupScreen";

describe("dismissStartupScreen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("adds exit class and removes the startup screen after the animation delay", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="startup-screen"></div>';

    dismissStartupScreen();

    const startupScreen = document.getElementById("startup-screen");
    expect(startupScreen).toHaveClass("startup-screen--exiting");
    expect(startupScreen?.dataset.state).toBe("closed");

    vi.advanceTimersByTime(420);

    expect(document.getElementById("startup-screen")).toBeNull();
  });

  it("does nothing when the startup screen is already closing", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="startup-screen" data-state="closed"></div>';

    dismissStartupScreen();
    vi.runAllTimers();

    const startupScreen = document.getElementById("startup-screen");
    expect(startupScreen).not.toHaveClass("startup-screen--exiting");
    expect(startupScreen?.dataset.state).toBe("closed");
  });
});
