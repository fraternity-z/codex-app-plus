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
  SettingsScreen: (props: { readonly sidebarCollapsed: boolean }) => (
    <div data-testid="settings-screen">settings collapsed:{String(props.sidebarCollapsed)}</div>
  ),
}));

vi.mock("../../features/notifications/ui/AppNotificationViewport", () => ({
  AppNotificationViewport: () => <div data-testid="app-notification-viewport" />,
}));

vi.mock("../../features/skills/ui/SkillsScreen", () => ({
  SkillsScreen: () => <div data-testid="skills-screen">skills</div>,
}));

vi.mock("./WindowTitlebar", () => ({
  WindowTitlebar: (props: {
    readonly navigationControl?: {
      readonly canGoBack: boolean;
      readonly canGoForward: boolean;
      readonly onGoBack: () => void;
      readonly onGoForward: () => void;
    } | null;
    readonly sidebarControl?: {
      readonly collapsed: boolean;
      readonly collapseLabel: string;
      readonly expandLabel: string;
      readonly onToggle: () => void;
    } | null;
  }) => (
    <div data-testid="window-titlebar">
      {props.navigationControl ? (
        <>
          <button
            type="button"
            aria-label="返回上一页"
            disabled={!props.navigationControl.canGoBack}
            onClick={props.navigationControl.onGoBack}
          >
            go back
          </button>
          <button
            type="button"
            aria-label="前进到下一页"
            disabled={!props.navigationControl.canGoForward}
            onClick={props.navigationControl.onGoForward}
          >
            go forward
          </button>
        </>
      ) : null}
      {props.sidebarControl ? (
        <button
          type="button"
          aria-label={props.sidebarControl.collapsed ? props.sidebarControl.expandLabel : props.sidebarControl.collapseLabel}
          onClick={props.sidebarControl.onToggle}
        >
          toggle sidebar
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("../../features/home/ui/HomeScreen", async () => {
  const React = await import("react");
  return {
    HomeScreen: (props: { readonly sidebarCollapsed: boolean }) => {
      const [count, setCount] = React.useState(0);

      return (
        <div data-testid="home-screen">
          <span>count:{count}</span>
          <span data-testid="home-sidebar-state">{String(props.sidebarCollapsed)}</span>
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
    subscribe: vi.fn().mockResolvedValue(() => undefined),
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
    canGoBack: false,
    canGoForward: false,
    settingsMenuOpen: false,
    shouldShowAuthChoice: false,
    workspace: createWorkspace(),
    authBusy: false,
    authLoginPending: false,
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
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

  it("renders the app notification viewport", () => {
    renderAppScreenContent("home");

    expect(screen.getByTestId("app-notification-viewport")).toBeInTheDocument();
  });

  it("toggles the home sidebar from the titlebar", () => {
    renderAppScreenContent("home");

    expect(screen.getByTestId("home-sidebar-state")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "折叠工作区侧边栏" }));

    expect(screen.getByTestId("home-sidebar-state")).toHaveTextContent("true");
    expect(screen.getByRole("button", { name: "展开工作区侧边栏" })).toBeInTheDocument();
  });

  it("toggles the settings sidebar from the titlebar", () => {
    renderAppScreenContent("general");

    expect(screen.getByTestId("settings-screen")).toHaveTextContent("settings collapsed:false");

    fireEvent.click(screen.getByRole("button", { name: "折叠设置侧边栏" }));

    expect(screen.getByTestId("settings-screen")).toHaveTextContent("settings collapsed:true");
    expect(screen.getByRole("button", { name: "展开设置侧边栏" })).toBeInTheDocument();
  });

  it("passes navigation actions to the titlebar", () => {
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();

    render(
      <AppScreenContent
        {...createProps({
          canGoBack: true,
          canGoForward: false,
          onGoBack,
          onGoForward,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "返回上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "前进到下一页" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    fireEvent.click(screen.getByRole("button", { name: "前进到下一页" }));

    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).not.toHaveBeenCalled();
  });
});
