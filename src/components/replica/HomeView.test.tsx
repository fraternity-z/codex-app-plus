import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import { HomeView } from "./HomeView";

vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => null
}));

vi.mock("./git/useWorkspaceGit", () => ({
  useWorkspaceGit: () => ({
    loading: false,
    pendingAction: null,
    status: null,
    statusLoaded: false,
    hasRepository: false,
    error: null,
    notice: null,
    commitMessage: "",
    selectedBranch: "",
    newBranchName: "",
    diff: null,
    diffTarget: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    initRepository: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined),
    unstagePaths: vi.fn().mockResolvedValue(undefined),
    discardPaths: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    checkoutSelectedBranch: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn()
  })
}));

vi.mock("./git/WorkspaceGitView", () => ({
  WorkspaceGitView: () => null
}));

function renderHomeView(overrides?: Partial<ComponentProps<typeof HomeView>>) {
  const root = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };
  const thread = {
    id: "thread-1",
    title: "First thread",
    cwd: root.path,
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z"
  };

  return render(
    <HomeView
      hostBridge={{} as HostBridge}
      busy={false}
      inputText=""
      roots={[root]}
      selectedRootId={root.id}
      selectedRootName={root.name}
      selectedRootPath={root.path}
      threads={[thread]}
      selectedThreadId={thread.id}
      messages={[]}
      pendingServerRequests={[]}
      connectionStatus="connected"
      fatalError={null}
      authStatus="authenticated"
      authMode="chatgpt"
      retryScheduledAt={null}
      settingsMenuOpen={false}
      onToggleSettingsMenu={vi.fn()}
      onDismissSettingsMenu={vi.fn()}
      onOpenSettings={vi.fn()}
      onSelectRoot={vi.fn()}
      onSelectThread={vi.fn()}
      onInputChange={vi.fn()}
      onCreateThread={vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onAddRoot={vi.fn()}
      onRemoveRoot={vi.fn()}
      onRetryConnection={vi.fn().mockResolvedValue(undefined)}
      onLogin={vi.fn().mockResolvedValue(undefined)}
      onApproveRequest={vi.fn().mockResolvedValue(undefined)}
      onRejectRequest={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  );
}

describe("HomeView", () => {
  it("toggles terminal button label through icon button", () => {
    renderHomeView();

    const toggleButton = screen.getByRole("button", { name: "隐藏终端" });

    expect(screen.queryByText("隐藏终端")).not.toBeInTheDocument();
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: "显示终端" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls remove handler when delete button is clicked", () => {
    const onRemoveRoot = vi.fn();
    const root = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };

    renderHomeView({ onRemoveRoot, roots: [root], selectedRootId: root.id, selectedRootName: root.name, selectedRootPath: root.path });

    fireEvent.click(screen.getByRole("button", { name: `移除工作区 ${root.name}` }));

    expect(onRemoveRoot).toHaveBeenCalledWith(root.id);
  });

  it("calls send handler when send button is clicked", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);

    renderHomeView({ inputText: "请分析当前工作区", onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSendTurn).toHaveBeenCalledTimes(1);
  });
});
