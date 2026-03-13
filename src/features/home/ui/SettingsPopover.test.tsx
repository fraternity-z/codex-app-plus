import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPopover } from "./SettingsPopover";

describe("SettingsPopover", () => {
  it("shows the logout action for authenticated users", () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPopover
        authStatus="authenticated"
        authMode="chatgpt"
        authBusy={false}
        authLoginPending={false}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={onLogout}
      />,
    );

    expect(screen.getByText("● 已通过 ChatGPT 登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "→ 退出登录" }));

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
        onOpenSettings={vi.fn()}
        onLogin={onLogin}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("● 未登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "→ 登录 ChatGPT" }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("disables auth actions while busy", () => {
    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={true}
        authLoginPending={true}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "→ 正在登录…" })).toBeDisabled();
  });
});
