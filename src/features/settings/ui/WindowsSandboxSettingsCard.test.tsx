import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WindowsSandboxSettingsCard } from "./WindowsSandboxSettingsCard";

const IDLE_STATE = { pending: false, mode: null, success: null, error: null } as const;

describe("WindowsSandboxSettingsCard", () => {
  it("renders the current configured mode", () => {
    render(
      <WindowsSandboxSettingsCard
        busy={false}
        configSnapshot={{ config: { profile: null }, origins: {}, layers: [{ name: { type: "user", file: "C:/Users/Administrator/.codex/config.toml" }, version: "1", config: { windows: { sandbox: "unelevated" } }, disabledReason: null }] }}
        setupState={IDLE_STATE}
        onStartSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

    expect(screen.getAllByText("标准模式").length).toBeGreaterThan(0);
    expect(screen.getByText(/windows\.sandbox/i)).toBeInTheDocument();
  });

  it("starts the requested setup mode from either action button", () => {
    const onStartSetup = vi.fn().mockResolvedValue({ started: true });
    render(
      <WindowsSandboxSettingsCard
        busy={false}
        configSnapshot={{ config: { profile: null }, origins: {}, layers: [] }}
        setupState={IDLE_STATE}
        onStartSetup={onStartSetup}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /标准模式（无需管理员）/i }));
    fireEvent.click(screen.getByRole("button", { name: /增强模式（管理员）/i }));

    expect(onStartSetup).toHaveBeenNthCalledWith(1, "unelevated");
    expect(onStartSetup).toHaveBeenNthCalledWith(2, "elevated");
  });

  it("disables actions while setup is pending", () => {
    render(
      <WindowsSandboxSettingsCard
        busy={false}
        configSnapshot={{ config: { profile: null }, origins: {}, layers: [] }}
        setupState={{ pending: true, mode: "unelevated", success: null, error: null }}
        onStartSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

    expect(screen.getByRole("button", { name: /配置进行中/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /增强模式（管理员）/i })).toBeDisabled();
  });

  it("shows the latest failure message", () => {
    render(
      <WindowsSandboxSettingsCard
        busy={false}
        configSnapshot={{ config: { profile: null }, origins: {}, layers: [] }}
        setupState={{ pending: false, mode: "elevated", success: false, error: "setup failed" }}
        onStartSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

    expect(screen.getByText("setup failed")).toBeInTheDocument();
  });
});
