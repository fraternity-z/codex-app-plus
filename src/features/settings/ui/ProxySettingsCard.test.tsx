import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { ProxySettingsCard } from "./ProxySettingsCard";

function renderCard(
  props: Partial<ComponentProps<typeof ProxySettingsCard>> = {},
) {
  return render(
    <ProxySettingsCard
      agentEnvironment="wsl"
      busy={false}
      readProxySettings={vi.fn().mockResolvedValue({
        settings: {
          enabled: true,
          httpProxy: "http://127.0.0.1:8080",
          httpsProxy: "",
          noProxy: "localhost",
        },
      })}
      writeProxySettings={vi.fn().mockResolvedValue({
        settings: {
          enabled: true,
          httpProxy: "http://127.0.0.1:9000",
          httpsProxy: "",
          noProxy: "localhost",
        },
      })}
      {...props}
    />,
    { wrapper: createI18nWrapper("zh-CN") },
  );
}

describe("ProxySettingsCard", () => {
  it("loads and renders the current environment settings", async () => {
    renderCard();

    expect(await screen.findByRole("button", { name: "使用系统代理" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/当前正在编辑 WSL 的 Codex 代理配置/)).toBeInTheDocument();
    expect(screen.getByText("自定义代理暂时下线：这条路径还有点问题，后续再重新设计。")).toBeInTheDocument();
  });

  it("saves the selected proxy mode and clears custom values", async () => {
    const writeProxySettings = vi.fn().mockResolvedValue({
      settings: {
        enabled: false,
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    });
    renderCard({ writeProxySettings });

    fireEvent.click(await screen.findByRole("button", { name: "不使用代理" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(writeProxySettings).toHaveBeenCalledWith({
        agentEnvironment: "wsl",
        enabled: false,
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      });
    });
    expect(screen.getByText("保存后，当前 app-server / Codex 连接需要手动重启才会生效。")).toBeInTheDocument();
  });

  it("does not render custom proxy fields", async () => {
    renderCard();

    expect(await screen.findByRole("button", { name: "使用系统代理" })).toBeInTheDocument();
    expect(screen.queryByLabelText("HTTP Proxy")).toBeNull();
    expect(screen.queryByLabelText("HTTPS Proxy")).toBeNull();
    expect(screen.queryByLabelText("NO_PROXY")).toBeNull();
  });
});
