import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider, type UiLanguage } from "../../../i18n";
import { AppStoreProvider } from "../../../state/store";
import { SettingsPopover } from "./SettingsPopover";
import type { AppServerClient } from "../../../protocol/appServerClient";

const mockAppServerClient = { request: vi.fn() } as unknown as AppServerClient;

function createTestWrapper(initialLanguage: UiLanguage = "zh-CN") {
  return function Wrapper({ children }: { children: React.ReactNode }): JSX.Element {
    const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
    return (
      <AppStoreProvider>
        <I18nProvider language={language} setLanguage={setLanguage}>
          {children}
        </I18nProvider>
      </AppStoreProvider>
    );
  };
}

describe("SettingsPopover", () => {
  it("shows the logout action for authenticated users", () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPopover
        authStatus="authenticated"
        authMode="chatgpt"
        authBusy={false}
        authLoginPending={false}
        rateLimits={null}
        account={null}
        appServerClient={mockAppServerClient}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={onLogout}
      />,
      { wrapper: createTestWrapper() }
    );

    expect(screen.getByText("已通过 ChatGPT 登录")).toBeInTheDocument();
    expect(screen.getByText("个人账户")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("shows the login action for logged out users", () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={false}
        authLoginPending={false}
        rateLimits={null}
        account={null}
        appServerClient={mockAppServerClient}
        onOpenSettings={vi.fn()}
        onLogin={onLogin}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createTestWrapper() }
    );

    expect(screen.getByText("未登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登录 ChatGPT" }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("disables auth actions while busy", () => {
    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={true}
        authLoginPending={true}
        rateLimits={null}
        account={null}
        appServerClient={mockAppServerClient}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createTestWrapper() }
    );

    expect(screen.getByRole("button", { name: "正在登录..." })).toBeDisabled();
  });

  it("renders translated English labels", () => {
    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={false}
        authLoginPending={false}
        rateLimits={null}
        account={null}
        appServerClient={mockAppServerClient}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createTestWrapper("en-US") }
    );

    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with ChatGPT" })).toBeInTheDocument();
  });

  it("shows account email when authenticated with ChatGPT", () => {
    render(
      <SettingsPopover
        authStatus="authenticated"
        authMode="chatgpt"
        authBusy={false}
        authLoginPending={false}
        rateLimits={null}
        account={{ authMode: "chatgpt", planType: "free", email: "927751260@qq.com" }}
        appServerClient={mockAppServerClient}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createTestWrapper() }
    );

    expect(screen.getByText("927751260@qq.com")).toBeInTheDocument();
  });

  it("shows the account limits trigger when rate limits are available", () => {
    render(
      <SettingsPopover
        authStatus="authenticated"
        authMode="chatgpt"
        authBusy={false}
        authLoginPending={false}
        rateLimits={{
          limitId: "primary",
          limitName: null,
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: null },
          secondary: null,
          credits: { hasCredits: true, unlimited: false, balance: "$10.00" },
          planType: null,
          rateLimitReachedType: null,
        }}
        account={{ authMode: "chatgpt", planType: "free", email: "927751260@qq.com" }}
        appServerClient={mockAppServerClient}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createTestWrapper() }
    );

    expect(screen.getByRole("button", { name: "剩余额度" })).toBeInTheDocument();
  });
});
