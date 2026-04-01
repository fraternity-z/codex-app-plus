import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import type { AppPreferencesController } from "../../features/settings/hooks/useAppPreferences";
import type { WorkspaceRootController } from "../../features/workspace/hooks/useWorkspaceRoots";
import type { AppController } from "../controller/appControllerTypes";
import { AppScreenContent, type AppScreen } from "./AppScreenContent";

vi.mock("../../features/auth/ui/AuthChoiceView", () => ({
  AuthChoiceView: () => <div data-testid="auth-choice-view">auth choice</div>,
}));

vi.mock("../../features/settings/ui/SettingsScreen", () => ({
  SettingsScreen: () => <div data-testid="settings-screen">settings</div>,
}));

vi.mock("../../features/skills/ui/SkillsScreen", () => ({
  SkillsScreen: () => <div data-testid="skills-screen">skills</div>,
}));

vi.mock("./WindowTitlebar", () => ({
  WindowTitlebar: () => <div data-testid="window-titlebar" />,
}));

vi.mock("../../features/home/ui/HomeScreen", async () => {
  const React = await import("react");
  return {
    HomeScreen: () => {
      const [count, setCount] = React.useState(0);

      return (
        <div data-testid="home-screen">
          <span>count:{count}</span>
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            increment
          </button>
        </div>
      );
    },
  };
});

function createHostBridge(): HostBridge {
  return {
    app: {
      controlWindow: vi.fn(),
    },
  } as unknown as HostBridge;
}

function createController(): AppController {
  return {} as unknown as AppController;
}

function createPreferences(): AppPreferencesController {
  return {} as unknown as AppPreferencesController;
}

function createWorkspace(): WorkspaceRootController {
  return {
    roots: [],
    managedWorktrees: [],
    selectedRoot: null,
    selectedRootId: null,
    selectRoot: vi.fn(),
    addRoot: vi.fn(),
    removeRoot: vi.fn(),
    reorderRoots: vi.fn(),
    addManagedWorktree: vi.fn(),
    removeManagedWorktree: vi.fn(),
    updateWorkspaceLaunchScripts: vi.fn(),
  };
}

function createProps(
  overrides: Partial<ComponentProps<typeof AppScreenContent>>,
): ComponentProps<typeof AppScreenContent> {
  return {
    controller: createController(),
    hostBridge: createHostBridge(),
    preferences: createPreferences(),
    resolvedTheme: "light",
    screen: "home",
    settingsMenuOpen: false,
    shouldShowAuthChoice: false,
    workspace: createWorkspace(),
    authBusy: false,
    authLoginPending: false,
    onBackHome: vi.fn(),
    onDismissSettingsMenu: vi.fn(),
    onOpenApiKeySettings: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenSettingsSection: vi.fn(),
    onOpenSkills: vi.fn(),
    onOpenSkillsLearnMore: vi.fn().mockResolvedValue(undefined),
    onToggleSettingsMenu: vi.fn(),
    ...overrides,
  };
}

function renderAppScreenContent(screenName: AppScreen) {
  return render(<AppScreenContent {...createProps({ screen: screenName })} />);
}

describe("AppScreenContent", () => {
  it("keeps HomeScreen mounted while settings are open", () => {
    const { rerender } = renderAppScreenContent("home");

    fireEvent.click(screen.getByRole("button", { name: "increment" }));
    expect(screen.getByText("count:1")).toBeInTheDocument();

    rerender(<AppScreenContent {...createProps({ screen: "general" })} />);

    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();
    expect(screen.getByTestId("home-screen").parentElement).toHaveStyle({ display: "none" });
    expect(screen.getByText("count:1")).toBeInTheDocument();

    rerender(<AppScreenContent {...createProps({ screen: "home" })} />);

    expect(screen.queryByTestId("settings-screen")).not.toBeInTheDocument();
    expect(screen.getByText("count:1")).toBeInTheDocument();
  });
});
