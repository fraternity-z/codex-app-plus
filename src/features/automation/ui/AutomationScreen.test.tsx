import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { WorkspaceRoot, WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import type { ComposerModelOption } from "../../composer/model/composerPreferences";
import type { AutomationsController } from "../hooks/useAutomations";
import { createAutomationRecord } from "../model/automations";
import { AutomationScreen } from "./AutomationScreen";

const workspaceRoot: WorkspaceRoot = {
  id: "root-1",
  name: "codex-app-plus",
  path: "E:\\code\\codex-app-plus",
};
const models: ReadonlyArray<ComposerModelOption> = [
  {
    id: "gpt-5.5",
    value: "gpt-5.5",
    label: "gpt-5.5",
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    isDefault: true,
  },
  {
    id: "gpt-5.4",
    value: "gpt-5.4",
    label: "gpt-5.4",
    defaultEffort: "medium",
    supportedEfforts: ["low", "medium", "high"],
    isDefault: false,
  },
];

function createWorkspace(): WorkspaceRootController {
  return {
    roots: [workspaceRoot],
    managedWorktrees: [],
    selectedRoot: workspaceRoot,
    selectedRootId: workspaceRoot.id,
    selectRoot: vi.fn(),
    addRoot: vi.fn(),
    removeRoot: vi.fn(),
    reorderRoots: vi.fn(),
    addManagedWorktree: vi.fn(),
    removeManagedWorktree: vi.fn(),
    updateWorkspaceLaunchScripts: vi.fn(),
  };
}

function createAutomations(
  overrides: Partial<AutomationsController> = {},
): AutomationsController {
  return {
    automations: [],
    createAutomation: vi.fn(),
    updateAutomation: vi.fn(),
    deleteAutomation: vi.fn(),
    setAutomationEnabled: vi.fn(),
    recordAutomationRunResult: vi.fn(),
    ...overrides,
  };
}

function renderAutomationScreen(props: {
  readonly automations?: AutomationsController;
  readonly workspace?: WorkspaceRootController;
} = {}) {
  const automations = props.automations ?? createAutomations();
  const workspace = props.workspace ?? createWorkspace();
  render(
    <AutomationScreen
      automations={automations}
      workspace={workspace}
      models={models}
      defaultModel="gpt-5.5"
      defaultEffort="high"
      defaultServiceTier={null}
      onOpenLearnMore={vi.fn().mockResolvedValue(undefined)}
    />,
    { wrapper: createI18nWrapper() },
  );
  return { automations, workspace };
}

describe("AutomationScreen", () => {
  it("marks automations as experimental with an availability notice", () => {
    renderAutomationScreen();

    expect(screen.getByText("实验性")).toBeInTheDocument();
    expect(screen.getByText("实验性功能，不保证可用性。")).toBeInTheDocument();
  });

  it("creates an automation from the blank dialog", () => {
    const { automations } = renderAutomationScreen();

    fireEvent.click(screen.getByRole("button", { name: "新建自动化功能" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Daily summary" } });
    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "Summarize today" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(automations.createAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Daily summary",
        prompt: "Summarize today",
        workspaceRootId: workspaceRoot.id,
        model: "gpt-5.5",
        effort: "high",
      }),
      workspaceRoot,
    );
  });

  it("prefills a template prompt when a template card is selected", () => {
    const { automations } = renderAutomationScreen();

    fireEvent.click(screen.getByText(/为站会总结昨天的 git 活动/));
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(automations.createAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "站会总结",
        prompt: expect.stringContaining("为站会总结昨天的 git 活动"),
        schedule: { mode: "weekdays", time: "09:00" },
        model: "gpt-5.5",
        effort: "high",
      }),
      workspaceRoot,
    );
  });

  it("updates an existing automation from the edit dialog", () => {
    const automation = createAutomationRecord(
      {
        name: "Old name",
        prompt: "Old prompt",
        schedule: { mode: "daily", time: "09:00" },
        workspaceRootId: workspaceRoot.id,
      },
      workspaceRoot,
      new Date(2026, 3, 28, 8, 0),
    );
    const automations = createAutomations({ automations: [automation] });
    renderAutomationScreen({ automations });

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Updated name" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(automations.updateAutomation).toHaveBeenCalledWith(
      automation.id,
      expect.objectContaining({
        name: "Updated name",
        prompt: "Old prompt",
      }),
      workspaceRoot,
    );
  });

  it("saves selected model and reasoning effort from the footer controls", () => {
    const { automations } = renderAutomationScreen();

    fireEvent.click(screen.getByRole("button", { name: "新建自动化功能" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Performance watch" } });
    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "Check regressions" } });
    fireEvent.click(screen.getByRole("button", { name: /选择模型/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "gpt-5.4" }));
    fireEvent.click(screen.getByRole("button", { name: /推理强度|思考强度/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "中" }));
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(automations.createAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4",
        effort: "medium",
      }),
      workspaceRoot,
    );
  });
});
