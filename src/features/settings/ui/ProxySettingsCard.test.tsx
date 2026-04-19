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
          mode: "system",
          httpProxy: "",
          httpsProxy: "",
          noProxy: "",
        },
      })}
      writeProxySettings={vi.fn().mockResolvedValue({
        settings: {
          mode: "system",
          httpProxy: "",
          httpsProxy: "",
          noProxy: "",
        },
      })}
      {...props}
    />,
    { wrapper: createI18nWrapper("zh-CN") },
  );
}

async function openModeMenu(): Promise<void> {
  const trigger = await screen.findByRole("button", {
    name: /^代理：/,
  });
  fireEvent.click(trigger);
  await screen.findByRole("menu", { name: "代理" });
}

describe("ProxySettingsCard", () => {
  it("renders only the title and the mode trigger in the header", async () => {
    renderCard();

    const trigger = await screen.findByRole("button", {
      name: "代理：使用系统代理",
    });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByText("代理模式")).toBeNull();
    expect(
      screen.queryByText(/在无代理、系统代理与自定义代理之间切换/),
    ).toBeNull();
    expect(
      screen.queryByText(
        /当前会读取系统代理，并写入 HTTP_PROXY \/ HTTPS_PROXY \/ NO_PROXY/,
      ),
    ).toBeNull();
    expect(screen.queryByText(/当前正在编辑/)).toBeNull();
    expect(
      screen.queryByText(/为 Codex、宿主 Git 与后续新建的内置终端会话选择代理模式/),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
  });

  it("applies switching from system to disabled immediately", async () => {
    const writeProxySettings = vi.fn().mockResolvedValue({
      settings: {
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    });
    renderCard({ writeProxySettings });

    await openModeMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "不使用代理" }));

    await waitFor(() => {
      expect(writeProxySettings).toHaveBeenCalledWith({
        agentEnvironment: "wsl",
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      });
    });
    expect(
      screen.getByText(
        "修改后，当前 app-server / Codex 连接需要手动重启才会生效。",
      ),
    ).toBeInTheDocument();
  });

  it("reveals custom proxy inputs without applying when values are empty", async () => {
    const writeProxySettings = vi.fn();
    renderCard({ writeProxySettings });

    await openModeMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "自定义代理" }));

    expect(screen.getByLabelText("HTTP 代理")).toBeInTheDocument();
    expect(screen.getByLabelText("HTTPS 代理")).toBeInTheDocument();
    expect(screen.getByLabelText("NO_PROXY")).toBeInTheDocument();
    expect(
      screen.getByText("自定义代理至少需要填写 HTTP 或 HTTPS 代理地址。"),
    ).toBeInTheDocument();
    expect(writeProxySettings).not.toHaveBeenCalled();
  });

  it("applies custom proxy values on blur once HTTP proxy is provided", async () => {
    const writeProxySettings = vi.fn(async (input) => ({
      settings: {
        mode: input.mode,
        httpProxy: input.httpProxy,
        httpsProxy: input.httpsProxy,
        noProxy: input.noProxy,
      },
    }));
    renderCard({ writeProxySettings });

    await openModeMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "自定义代理" }));

    const httpInput = screen.getByLabelText("HTTP 代理");
    fireEvent.change(httpInput, {
      target: { value: " http://127.0.0.1:7890 " },
    });
    fireEvent.blur(httpInput);

    await waitFor(() => {
      expect(writeProxySettings).toHaveBeenCalledWith({
        agentEnvironment: "wsl",
        mode: "custom",
        httpProxy: "http://127.0.0.1:7890",
        httpsProxy: "",
        noProxy: "",
      });
    });

    const noProxyInput = screen.getByLabelText("NO_PROXY");
    fireEvent.change(noProxyInput, { target: { value: "localhost" } });
    fireEvent.blur(noProxyInput);

    await waitFor(() => {
      expect(writeProxySettings).toHaveBeenLastCalledWith({
        agentEnvironment: "wsl",
        mode: "custom",
        httpProxy: "http://127.0.0.1:7890",
        httpsProxy: "",
        noProxy: "localhost",
      });
    });
  });

  it("clears custom inputs and applies immediately when switching away from custom", async () => {
    const writeProxySettings = vi.fn().mockResolvedValue({
      settings: {
        mode: "system",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    });
    renderCard({
      readProxySettings: vi.fn().mockResolvedValue({
        settings: {
          mode: "custom",
          httpProxy: "http://127.0.0.1:7890",
          httpsProxy: "",
          noProxy: "localhost",
        },
      }),
      writeProxySettings,
    });

    expect(
      await screen.findByDisplayValue("http://127.0.0.1:7890"),
    ).toBeInTheDocument();

    await openModeMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "使用系统代理" }));

    expect(screen.queryByLabelText("HTTP 代理")).toBeNull();
    await waitFor(() => {
      expect(writeProxySettings).toHaveBeenCalledWith({
        agentEnvironment: "wsl",
        mode: "system",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      });
    });
  });
});
