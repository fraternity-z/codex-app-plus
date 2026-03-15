import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivedNotification } from "../../../domain/types";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import type { SkillsRemoteReadResponse } from "../../../protocol/generated/v2/SkillsRemoteReadResponse";
import { SkillsView } from "./SkillsView";

function createInstalledSkillsResponse(enabled = true): SkillsListResponse {
  return {
    data: [{
      cwd: "E:/code/codex-app-plus",
      errors: [],
      skills: [{
        name: "word-docs",
        description: "Edit and review docx files",
        interface: {
          displayName: "Word Docs",
          shortDescription: "Edit and review docx files",
          brandColor: "#f97316",
        },
        dependencies: undefined,
        path: "C:/Users/Administrator/.codex/skills/doc",
        scope: "user",
        enabled,
      }],
    }],
  };
}

function createRemoteSkillsResponse(): SkillsRemoteReadResponse {
  return {
    data: [{
      id: "openai/figma",
      name: "Figma",
      description: "Use Figma MCP for design-to-code work",
    }],
  };
}

function renderSkillsView(overrides?: {
  readonly notifications?: ReadonlyArray<ReceivedNotification>;
  readonly listSkills?: ReturnType<typeof vi.fn>;
  readonly listRemoteSkills?: ReturnType<typeof vi.fn>;
  readonly writeSkillConfig?: ReturnType<typeof vi.fn>;
  readonly exportRemoteSkill?: ReturnType<typeof vi.fn>;
}) {
  const listSkills = overrides?.listSkills ?? vi.fn().mockResolvedValue(createInstalledSkillsResponse());
  const listRemoteSkills = overrides?.listRemoteSkills ?? vi.fn().mockResolvedValue(createRemoteSkillsResponse());
  const writeSkillConfig = overrides?.writeSkillConfig ?? vi.fn().mockResolvedValue({ effectiveEnabled: false });
  const exportRemoteSkill = overrides?.exportRemoteSkill ?? vi.fn().mockResolvedValue({
    id: "openai/figma",
    path: "C:/Users/Administrator/.codex/skills/figma",
  });

  const view = render(
    <SkillsView
      selectedRootPath="E:/code/codex-app-plus"
      notifications={overrides?.notifications ?? []}
      onBackHome={vi.fn()}
      onOpenLearnMore={vi.fn().mockResolvedValue(undefined)}
      listSkills={listSkills}
      listRemoteSkills={listRemoteSkills}
      writeSkillConfig={writeSkillConfig}
      exportRemoteSkill={exportRemoteSkill}
    />,
  );

  return { ...view, listSkills, listRemoteSkills, writeSkillConfig, exportRemoteSkill };
}

describe("SkillsView", () => {
  it("loads installed and recommended skills on mount", async () => {
    renderSkillsView();

    expect(await screen.findByText("Word Docs")).toBeInTheDocument();
    expect(await screen.findByText("Figma")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Word Docs已启用" })).toHaveAttribute("aria-checked", "true");
  });

  it("writes config when toggling an installed skill", async () => {
    const { writeSkillConfig } = renderSkillsView();

    fireEvent.click(await screen.findByRole("switch", { name: "Word Docs已启用" }));

    await waitFor(() => expect(writeSkillConfig).toHaveBeenCalledWith({
      path: "C:/Users/Administrator/.codex/skills/doc",
      enabled: false,
    }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Word Docs已禁用" })).toHaveAttribute("aria-checked", "false"));
  });

  it("installs a remote skill and refreshes the installed list", async () => {
    const listSkills = vi.fn()
      .mockResolvedValueOnce({ data: [{ cwd: "E:/code/codex-app-plus", errors: [], skills: [] }] })
      .mockResolvedValueOnce(createInstalledSkillsResponse());
    const exportRemoteSkill = vi.fn().mockResolvedValue({
      id: "openai/figma",
      path: "C:/Users/Administrator/.codex/skills/figma",
    });
    renderSkillsView({ listSkills, exportRemoteSkill });

    fireEvent.click(await screen.findByRole("button", { name: "安装" }));

    await waitFor(() => expect(exportRemoteSkill).toHaveBeenCalledWith({ hazelnutId: "openai/figma" }));
    expect(await screen.findByText("Word Docs")).toBeInTheDocument();
  });

  it("shows remote loading errors explicitly", async () => {
    renderSkillsView({
      listRemoteSkills: vi.fn().mockRejectedValue(new Error("git fetch failed: git process timed out after 30000ms")),
    });

    expect(await screen.findByText("git fetch failed: git process timed out after 30000ms")).toBeInTheDocument();
  });

  it("forces reload on manual refresh and skills changed notifications", async () => {
    const listSkills = vi.fn().mockResolvedValue(createInstalledSkillsResponse());
    const view = renderSkillsView({ listSkills, notifications: [] });

    await screen.findByText("Word Docs");
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(listSkills).toHaveBeenLastCalledWith({
      cwds: ["E:/code/codex-app-plus"],
      forceReload: true,
    }));

    view.rerender(
      <SkillsView
        selectedRootPath="E:/code/codex-app-plus"
        notifications={[{ method: "skills/changed", params: null }]}
        onBackHome={vi.fn()}
        onOpenLearnMore={vi.fn().mockResolvedValue(undefined)}
        listSkills={listSkills}
        listRemoteSkills={vi.fn().mockResolvedValue(createRemoteSkillsResponse())}
        writeSkillConfig={vi.fn().mockResolvedValue({ effectiveEnabled: false })}
        exportRemoteSkill={vi.fn().mockResolvedValue({ id: "openai/figma", path: "x" })}
      />,
    );

    await waitFor(() => expect(listSkills.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(listSkills.mock.calls.at(-1)?.[0]).toEqual({
      cwds: ["E:/code/codex-app-plus"],
      forceReload: true,
    });
  });
});
