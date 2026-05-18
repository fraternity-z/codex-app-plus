import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_APP_UPDATE_STATE } from "../../../domain/appUpdate";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { AppUpdateCard } from "./AppUpdateCard";

describe("AppUpdateCard", () => {
  it("shows the install action after a download completes", () => {
    const installAppUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <AppUpdateCard
        appUpdate={{
          ...INITIAL_APP_UPDATE_STATE,
          status: "downloaded",
          currentVersion: "0.1.0",
          nextVersion: "0.2.0",
          notes: "Bug fixes",
          lastCheckedAt: "2026-03-19T09:00:00.000Z",
        }}
        onCheckForAppUpdate={vi.fn().mockResolvedValue(undefined)}
        onInstallAppUpdate={installAppUpdate}
      />,
      { wrapper: createI18nWrapper("zh-CN") },
    );

    expect(screen.getByText("应用更新")).toBeInTheDocument();
    expect(screen.getByText("当前版本：0.1.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即安装" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "立即安装" }));

    expect(installAppUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders progress and release notes in English", () => {
    render(
      <AppUpdateCard
        appUpdate={{
          ...INITIAL_APP_UPDATE_STATE,
          status: "downloading",
          currentVersion: "0.1.0",
          nextVersion: "0.2.0",
          notes: "Added auto update support",
          downloadedBytes: 2_048,
          totalBytes: 4_096,
          progressPercent: 0.5,
        }}
        onCheckForAppUpdate={vi.fn().mockResolvedValue(undefined)}
        onInstallAppUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createI18nWrapper("en-US") },
    );

    expect(screen.getByText("App updates")).toBeInTheDocument();
    expect(screen.getByText("Current version: 0.1.0")).toBeInTheDocument();
    expect(screen.getByText("Downloaded 2 KB / 4 KB")).toBeInTheDocument();
    expect(screen.getByText("Release notes")).toBeInTheDocument();
    expect(screen.getByText("Added auto update support")).toBeInTheDocument();
  });

  it("disables update checks when updates are unavailable", () => {
    render(
      <AppUpdateCard
        appUpdate={{
          ...INITIAL_APP_UPDATE_STATE,
          status: "disabled",
          currentVersion: "0.1.0",
        }}
        onCheckForAppUpdate={vi.fn().mockResolvedValue(undefined)}
        onInstallAppUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createI18nWrapper("zh-CN") },
    );

    expect(screen.getByText("开发或测试模式下已禁用自动更新。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已禁用" })).toBeDisabled();
  });
});
