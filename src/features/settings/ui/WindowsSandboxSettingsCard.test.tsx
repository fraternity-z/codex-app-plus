import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { WindowsSandboxSettingsCard } from "./WindowsSandboxSettingsCard";

const IDLE_STATE = { pending: false, mode: null, success: null, error: null } as const;

function renderCard(
  props: ComponentProps<typeof WindowsSandboxSettingsCard>,
  locale: Locale = "zh-CN"
) {
  return render(<WindowsSandboxSettingsCard {...props} />, {
    wrapper: createI18nWrapper(locale)
  });
}

describe("WindowsSandboxSettingsCard", () => {
  it("renders the current configured mode", () => {
    renderCard({
      agentEnvironment: "windowsNative",
      busy: false,
      configSnapshot: { config: { profile: null }, origins: {}, layers: [{ name: { type: "user", file: "C:/Users/Administrator/.codex/config.toml" }, version: "1", config: { windows: { sandbox: "unelevated" } }, disabledReason: null }] },
      setupState: IDLE_STATE,
      onToggle: vi.fn().mockResolvedValue(undefined)
    });

    expect(screen.getAllByText("已启用").length).toBeGreaterThan(0);
    expect(screen.getByText(/windows\.sandbox/i)).toBeInTheDocument();
  });

  it("toggles the Windows Sandbox switch", () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    renderCard({
      agentEnvironment: "windowsNative",
      busy: false,
      configSnapshot: { config: { profile: null }, origins: {}, layers: [] },
      setupState: IDLE_STATE,
      onToggle
    });

    fireEvent.click(screen.getByRole("switch", { name: "Windows 沙盒" }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("disables the switch while setup is pending", () => {
    renderCard({
      agentEnvironment: "windowsNative",
      busy: false,
      configSnapshot: { config: { profile: null }, origins: {}, layers: [] },
      setupState: { pending: true, mode: "unelevated", success: null, error: null },
      onToggle: vi.fn().mockResolvedValue(undefined)
    });

    expect(screen.getByRole("switch", { name: "Windows 沙盒" })).toBeDisabled();
  });

  it("shows the latest failure message", () => {
    renderCard({
      agentEnvironment: "windowsNative",
      busy: false,
      configSnapshot: { config: { profile: null }, origins: {}, layers: [] },
      setupState: { pending: false, mode: "elevated", success: false, error: "setup failed" },
      onToggle: vi.fn().mockResolvedValue(undefined)
    });

    expect(screen.getByText("setup failed")).toBeInTheDocument();
  });

  it("shows that sandbox will wait for the Windows native agent environment", () => {
    renderCard({
      agentEnvironment: "wsl",
      busy: false,
      configSnapshot: { config: { profile: null }, origins: {}, layers: [] },
      setupState: IDLE_STATE,
      onToggle: vi.fn().mockResolvedValue(undefined)
    });

    expect(screen.getByText("当前 Agent 运行环境不是 Windows 原生；启用后会在切回 Windows 原生时自动生效。")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Windows 沙盒" })).toBeEnabled();
  });

  it("renders English copy when locale is en-US", () => {
    renderCard({
      agentEnvironment: "windowsNative",
      busy: false,
      configSnapshot: { config: { profile: null }, origins: {}, layers: [] },
      setupState: IDLE_STATE,
      onToggle: vi.fn().mockResolvedValue(undefined)
    }, "en-US");

    expect(screen.getByText("Windows Sandbox")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Windows Sandbox" })).toBeInTheDocument();
  });
});
