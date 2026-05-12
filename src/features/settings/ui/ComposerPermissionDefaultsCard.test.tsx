import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { WorkspaceRoot } from "../../workspace";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferences,
  type AppPreferencesController,
} from "../hooks/useAppPreferences";
import { ComposerPermissionDefaultsCard } from "./ComposerPermissionDefaultsCard";

const USER_CONFIG_FILE = "C:/Users/Administrator/.codex/config.toml";
const PROJECT_ROOT: WorkspaceRoot = {
  id: "root-1",
  name: "indiviual",
  path: "E:/code/indiviual",
};

function createConfigSnapshot(
  overrides: Partial<ConfigReadResponse["config"]> = {},
  version = "u1",
): ConfigReadResponse {
  return {
    config: {
      approval_policy: "on-request",
      sandbox_mode: "workspace-write",
      sandbox_workspace_write: {
        writable_roots: [],
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
      },
      ...overrides,
    },
    origins: {},
    layers: [
      {
        name: { type: "user", file: USER_CONFIG_FILE },
        version,
        config: {},
        disabledReason: null,
      },
    ],
  } as unknown as ConfigReadResponse;
}

function createProjectSnapshot(overrides: Partial<ConfigReadResponse["config"]> = {}): ConfigReadResponse {
  return {
    ...createConfigSnapshot(overrides),
    layers: [
      {
        name: { type: "project", dotCodexFolder: "E:/code/indiviual/.codex" },
        version: "p1",
        config: {},
        disabledReason: null,
      },
    ],
  } as unknown as ConfigReadResponse;
}

function createPreferencesController(
  preferences: AppPreferences,
  setPreferences: Dispatch<SetStateAction<AppPreferences>>
): AppPreferencesController {
  return {
    ...preferences,
    setAgentEnvironment: vi.fn(),
    setWorkspaceOpener: vi.fn(),
    setEmbeddedTerminalShell: vi.fn(),
    setEmbeddedTerminalUtf8: vi.fn(),
    setNotificationDeliveryMode: vi.fn(),
    setNotificationTriggerMode: vi.fn(),
    setSubagentNotificationsEnabled: vi.fn(),
    setThemeMode: vi.fn(),
    setUiLanguage: vi.fn(),
    setThreadDetailLevel: vi.fn(),
    setFollowUpQueueMode: vi.fn(),
    setComposerEnterBehavior: vi.fn(),
    setComposerPermissionLevel: vi.fn(),
    setComposerDefaultApprovalPolicy: (composerDefaultApprovalPolicy) =>
      setPreferences((current) => ({ ...current, composerDefaultApprovalPolicy })),
    setComposerDefaultSandboxMode: (composerDefaultSandboxMode) =>
      setPreferences((current) => ({ ...current, composerDefaultSandboxMode })),
    setComposerFullApprovalPolicy: (composerFullApprovalPolicy) =>
      setPreferences((current) => ({ ...current, composerFullApprovalPolicy })),
    setComposerFullSandboxMode: (composerFullSandboxMode) =>
      setPreferences((current) => ({ ...current, composerFullSandboxMode })),
    setUiFontFamily: vi.fn(),
    setUiFontSize: vi.fn(),
    setCodeFontFamily: vi.fn(),
    setCodeFontSize: vi.fn(),
    setGitBranchPrefix: vi.fn(),
    setGitPushForceWithLease: vi.fn(),
    setGitCommitInstructions: vi.fn(),
    setGitPullRequestMergeMethod: vi.fn(),
    setGitDraftPullRequest: vi.fn(),
    setGitAutoDeleteWorktrees: vi.fn(),
    setGitAutoDeleteRetention: vi.fn(),
    setGitPullRequestInstructions: vi.fn(),
    setContrast: vi.fn(),
    setAppearanceThemeColors: vi.fn(),
    setCodeStyle: vi.fn(),
    setSelectedPetId: vi.fn(),
  };
}

function renderCard(options: {
  readonly locale?: Locale;
  readonly selectedRoot?: WorkspaceRoot | null;
  readonly configSnapshot?: ConfigReadResponse;
  readonly projectSnapshot?: ConfigReadResponse;
  readonly batchWriteConfigSnapshot?: ReturnType<typeof vi.fn>;
  readonly writeProjectPermissionConfig?: ReturnType<typeof vi.fn>;
  readonly refreshConfigSnapshot?: ReturnType<typeof vi.fn>;
} = {}): void {
  const configSnapshot = options.configSnapshot ?? createConfigSnapshot();
  const projectSnapshot = options.projectSnapshot ?? createProjectSnapshot();

  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
    const batchWriteConfigSnapshot = options.batchWriteConfigSnapshot ?? vi.fn().mockResolvedValue({
      config: configSnapshot,
      write: {},
    });
    const writeProjectPermissionConfig = options.writeProjectPermissionConfig ?? vi.fn().mockResolvedValue({
      filePath: "E:/code/indiviual/.codex/config.toml",
    });
    const refreshConfigSnapshot = options.refreshConfigSnapshot ?? vi.fn(async (cwd?: string | null) => (
      cwd === undefined || cwd === null ? configSnapshot : projectSnapshot
    ));
    return (
      <ComposerPermissionDefaultsCard
        preferences={createPreferencesController(preferences, setPreferences)}
        agentEnvironment="windowsNative"
        configSnapshot={configSnapshot}
        selectedRoot={options.selectedRoot ?? null}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        writeProjectPermissionConfig={writeProjectPermissionConfig}
        refreshConfigSnapshot={refreshConfigSnapshot}
        batchWriteConfigSnapshot={batchWriteConfigSnapshot}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(options.locale ?? "zh-CN") });
}

describe("ComposerPermissionDefaultsCard", () => {
  it("writes global approval policy changes to user config.toml", async () => {
    const batchWriteConfigSnapshot = vi.fn().mockResolvedValue({
      config: createConfigSnapshot({ approval_policy: "on-failure" }),
      write: {},
    });
    renderCard({ batchWriteConfigSnapshot });

    fireEvent.click(screen.getByRole("button", { name: "批准策略：On request" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "On failure" }));

    await waitFor(() => expect(batchWriteConfigSnapshot).toHaveBeenCalledWith({
      edits: [{ keyPath: "approval_policy", value: "on-failure", mergeStrategy: "replace" }],
      filePath: USER_CONFIG_FILE,
      expectedVersion: "u1",
      reloadUserConfig: true,
    }));
  });

  it("writes project network access to the selected workspace .codex config", async () => {
    const batchWriteConfigSnapshot = vi.fn().mockResolvedValue({
      config: createProjectSnapshot({
        sandbox_workspace_write: {
          writable_roots: [],
          network_access: true,
          exclude_tmpdir_env_var: false,
          exclude_slash_tmp: false,
        },
      }),
      write: {},
    });
    const writeProjectPermissionConfig = vi.fn().mockResolvedValue({
      filePath: "E:/code/indiviual/.codex/config.toml",
    });
    const refreshConfigSnapshot = vi.fn(async (cwd?: string | null) => (
      cwd === undefined || cwd === null ? createConfigSnapshot() : createProjectSnapshot()
    ));
    renderCard({
      selectedRoot: PROJECT_ROOT,
      batchWriteConfigSnapshot,
      writeProjectPermissionConfig,
      refreshConfigSnapshot,
    });

    fireEvent.click(screen.getByRole("button", { name: "配置范围：用户配置" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "indiviual" }));

    await waitFor(() => expect(refreshConfigSnapshot).toHaveBeenCalledWith("E:/code/indiviual"));
    refreshConfigSnapshot.mockClear();

    fireEvent.click(screen.getByRole("switch", { name: "允许网络访问" }));

    await waitFor(() => expect(writeProjectPermissionConfig).toHaveBeenCalledWith({
      agentEnvironment: "windowsNative",
      filePath: "E:/code/indiviual/.codex/config.toml",
      approvalPolicy: null,
      sandboxMode: null,
      networkAccess: true,
    }));
    expect(batchWriteConfigSnapshot).not.toHaveBeenCalled();
    expect(refreshConfigSnapshot).not.toHaveBeenCalled();
  });

  it("retries global permission writes against freshly read config versions", async () => {
    const conflict = new Error(
      "协议错误: [-32600] Configuration was modified since last read. Fetch latest version and retry.",
    );
    const batchWriteConfigSnapshot = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        config: createConfigSnapshot({ sandbox_mode: "danger-full-access" }, "u4"),
        write: {},
      });
    const refreshConfigSnapshot = vi.fn()
      .mockResolvedValueOnce(createConfigSnapshot({}, "u2"))
      .mockResolvedValueOnce(createConfigSnapshot({}, "u3"));
    renderCard({ batchWriteConfigSnapshot, refreshConfigSnapshot });

    fireEvent.click(screen.getByRole("button", { name: "沙盒设置：Workspace write" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Danger full access" }));

    await waitFor(() => expect(batchWriteConfigSnapshot).toHaveBeenCalledTimes(3));
    expect(batchWriteConfigSnapshot.mock.calls.map(([params]) => params.expectedVersion)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("renders the permission defaults title and descriptions", () => {
    renderCard();

    expect(screen.getByText("自定义 config.toml 设置")).toBeInTheDocument();
    expect(screen.getByText("选择 Codex 何时请求批准")).toBeInTheDocument();
    expect(screen.getByText("选择 Codex 的命令执行权限")).toBeInTheDocument();
    expect(screen.getByText("当沙盒设置为工作区写入时允许网络访问")).toBeInTheDocument();
    expect(screen.queryByText("完全访问 · 审批策略")).toBeNull();
    expect(screen.queryByText("完全访问 · 访问模式")).toBeNull();
  });

  it("renders English copy when locale is en-US", () => {
    renderCard({ locale: "en-US" });

    expect(screen.getByText("Custom config.toml settings")).toBeInTheDocument();
    expect(screen.getByText("Approval policy")).toBeInTheDocument();
    expect(screen.getByText("Sandbox settings")).toBeInTheDocument();
    expect(screen.getByText("Allow network access")).toBeInTheDocument();
    expect(screen.queryByText("Full access · Access mode")).toBeNull();
  });
});
