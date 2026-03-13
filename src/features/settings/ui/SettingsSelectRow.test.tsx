import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsSelectRow } from "./SettingsSelectRow";

const OPTIONS = [
  { value: "enter", label: "Enter 发送" },
  { value: "cmdIfMultiline", label: "多行时 Ctrl/Cmd+Enter 发送" },
] as const;

function createRect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 240,
    width: 240,
    height: bottom - top,
    toJSON: () => ({})
  } as DOMRect;
}

function renderRow() {
  render(
    <SettingsSelectRow
      label="回车行为"
      description="Composer 中 Enter 的发送规则。"
      value="enter"
      options={OPTIONS}
      onChange={vi.fn()}
    />
  );

  return screen.getByRole("button", { name: "回车行为：Enter 发送" });
}

function renderRowInScrollContainer() {
  render(
    <div data-testid="scroll-container" style={{ overflowY: "auto", maxHeight: "160px" }}>
      <SettingsSelectRow
        label="回车行为"
        description="Composer 中 Enter 的发送规则。"
        value="enter"
        options={OPTIONS}
        onChange={vi.fn()}
      />
    </div>
  );

  return {
    trigger: screen.getByRole("button", { name: "回车行为：Enter 发送" }),
    scrollContainer: screen.getByTestId("scroll-container") as HTMLDivElement,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerHeight", { value: 768, configurable: true, writable: true });
});

describe("SettingsSelectRow", () => {
  it("opens upward when the control is near the viewport bottom", async () => {
    const trigger = renderRow();
    const control = trigger.parentElement as HTMLDivElement;

    Object.defineProperty(window, "innerHeight", { value: 180, configurable: true, writable: true });
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue(createRect(128, 164));

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: "回车行为" })).toHaveClass("settings-select-menu-up");
    });
  });

  it("keeps the default downward placement when there is enough room", async () => {
    const trigger = renderRow();
    const control = trigger.parentElement as HTMLDivElement;

    Object.defineProperty(window, "innerHeight", { value: 720, configurable: true, writable: true });
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue(createRect(120, 156));

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: "回车行为" })).not.toHaveClass("settings-select-menu-up");
    });
  });

  it("opens upward when the nearest scroll container has no room below", async () => {
    const { trigger, scrollContainer } = renderRowInScrollContainer();
    const control = trigger.parentElement as HTMLDivElement;

    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true, writable: true });
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue(createRect(0, 180));
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue(createRect(128, 164));

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: "回车行为" })).toHaveClass("settings-select-menu-up");
    });
  });
});
