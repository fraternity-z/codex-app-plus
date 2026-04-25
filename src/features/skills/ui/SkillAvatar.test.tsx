import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { SkillAvatar } from "./SkillAvatar";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
  isTauri: vi.fn(() => false),
}));

describe("SkillAvatar", () => {
  beforeEach(() => {
    vi.mocked(convertFileSrc).mockClear();
    vi.mocked(convertFileSrc).mockImplementation((path: string) => `asset://${path}`);
    vi.mocked(isTauri).mockReturnValue(false);
  });

  it("renders remote icons without converting them", () => {
    const { container } = render(
      <SkillAvatar brandColor={null} icon="https://example.com/icon.png" name="Browser Use" />,
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/icon.png");
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("converts local Windows icon paths inside Tauri", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const iconPath = "C:/Users/Administrator/.codex/.tmp/plugins/plugins/notion/assets/notion.png";
    const { container } = render(
      <SkillAvatar brandColor={null} icon={iconPath} name="Notion" />,
    );

    expect(convertFileSrc).toHaveBeenCalledWith(iconPath);
    expect(container.querySelector("img")).toHaveAttribute("src", `asset://${iconPath}`);
  });

  it("normalizes file URLs before converting them inside Tauri", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const { container } = render(
      <SkillAvatar
        brandColor={null}
        icon="file:///C:/Users/Administrator/.codex/.tmp/plugins/plugins/slack/assets/app-icon.png"
        name="Slack"
      />,
    );

    expect(convertFileSrc).toHaveBeenCalledWith("C:/Users/Administrator/.codex/.tmp/plugins/plugins/slack/assets/app-icon.png");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "asset://C:/Users/Administrator/.codex/.tmp/plugins/plugins/slack/assets/app-icon.png",
    );
  });

  it("falls back to initials for local paths outside Tauri", () => {
    render(
      <SkillAvatar
        brandColor="#2563eb"
        icon="C:/Users/Administrator/.codex/.tmp/plugins/plugins/notion/assets/notion.png"
        name="Notion"
      />,
    );

    expect(screen.getByText("N")).toBeInTheDocument();
    expect(convertFileSrc).not.toHaveBeenCalled();
  });
});
