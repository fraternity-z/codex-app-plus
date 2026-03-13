import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthChoiceView } from "./AuthChoiceView";

describe("AuthChoiceView", () => {
  it("renders both authentication options", () => {
    render(
      <AuthChoiceView
        busy={false}
        loginPending={false}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onUseApiKey={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "选择登录方式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用账户登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用 API Key" })).toBeInTheDocument();
  });

  it("fires the corresponding handlers", () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const onUseApiKey = vi.fn();

    render(
      <AuthChoiceView
        busy={false}
        loginPending={false}
        onLogin={onLogin}
        onUseApiKey={onUseApiKey}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "使用账户登录" }));
    fireEvent.click(screen.getByRole("button", { name: "使用 API Key" }));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onUseApiKey).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while busy", () => {
    render(
      <AuthChoiceView
        busy={true}
        loginPending={true}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onUseApiKey={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "正在跳转登录…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "使用 API Key" })).toBeDisabled();
  });
});
