import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge, WorkspaceOpener } from "../../../bridge/types";
import { useAppSelector } from "../../../state/store";
import { AppStoreProvider } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { WorkspaceOpenButton } from "./WorkspaceOpenButton";

function createHostBridge(overrides?: {
  readonly openExternal?: ReturnType<typeof vi.fn>;
  readonly openWorkspace?: ReturnType<typeof vi.fn>;
}): HostBridge {
  return {
    appServer: {
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
    },
    rpc: {
      request: vi.fn(),
      notify: vi.fn(),
      cancel: vi.fn(),
    },
    serverRequest: {
      resolve: vi.fn(),
    },
    app: {
      openExternal: overrides?.openExternal ?? vi.fn().mockResolvedValue(undefined),
      openWorkspace: overrides?.openWorkspace ?? vi.fn().mockResolvedValue(undefined),
      openFileInEditor: vi.fn().mockResolvedValue(undefined),
      openCodexConfigToml: vi.fn(),
      revealPathInFolder: vi.fn(),
      clearChatgptAuthState: vi.fn(),
      showNotification: vi.fn(),
      showContextMenu: vi.fn(),
      importOfficialData: vi.fn(),
      listCodexSessions: vi.fn(),
      readCodexSession: vi.fn(),
      deleteCodexSession: vi.fn(),
    },
    git: {
      getStatusSnapshot: vi.fn(),
      getBranchRefs: vi.fn(),
      getRemoteUrl: vi.fn(),
      getDiff: vi.fn(),
      getWorkspaceDiffs: vi.fn(),
      initRepository: vi.fn(),
      stagePaths: vi.fn(),
      unstagePaths: vi.fn(),
      discardPaths: vi.fn(),
      commit: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      checkout: vi.fn(),
      deleteBranch: vi.fn(),
    },
    terminal: {
      createSession: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      closeSession: vi.fn(),
    },
    subscribe: vi.fn(),
  } as unknown as HostBridge;
}

function BannerProbe(): JSX.Element | null {
  const banners = useAppSelector((state) => state.banners);
  const latestBanner = banners[0] ?? null;

  if (latestBanner === null) {
    return null;
  }

  return <span>{latestBanner.title}</span>;
}

function renderControlledButton(props: {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly initialOpener?: WorkspaceOpener;
}): void {
  function Wrapper(): JSX.Element {
    const [selectedOpener, setSelectedOpener] = useState<WorkspaceOpener>(
      props.initialOpener ?? "vscode",
    );

    return (
      <AppStoreProvider>
        <WorkspaceOpenButton
          hostBridge={props.hostBridge}
          selectedRootPath={props.selectedRootPath}
          selectedOpener={selectedOpener}
          onSelectOpener={setSelectedOpener}
        />
        <BannerProbe />
      </AppStoreProvider>
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper() });
}

describe("WorkspaceOpenButton", () => {
  it("disables the main button when no workspace is selected", () => {
    renderControlledButton({
      hostBridge: createHostBridge(),
      selectedRootPath: null,
    });

    expect(
      screen.getByRole("button", { name: "使用 VS Code 打开当前工作区" }),
    ).toBeDisabled();
  });

  it("opens the selected workspace in VS Code by default", async () => {
    const openWorkspace = vi.fn().mockResolvedValue(undefined);
    renderControlledButton({
      hostBridge: createHostBridge({ openWorkspace }),
      selectedRootPath: "E:/code/My Project",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "使用 VS Code 打开当前工作区" }),
    );

    await waitFor(() => {
      expect(openWorkspace).toHaveBeenCalledWith({
        path: "E:/code/My Project",
        opener: "vscode",
      });
    });
  });

  it("switches the main action after choosing File Explorer", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    renderControlledButton({
      hostBridge: createHostBridge({ openExternal }),
      selectedRootPath: "E:/code/project",
    });

    fireEvent.click(screen.getByRole("button", { name: "选择打开方式" }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "File Explorer" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "使用 File Explorer 打开当前工作区" }),
    );

    await waitFor(() => {
      expect(openExternal).toHaveBeenCalledWith("E:/code/project");
    });
  });

  it("switches the main action after choosing Terminal", async () => {
    const openWorkspace = vi.fn().mockResolvedValue(undefined);
    renderControlledButton({
      hostBridge: createHostBridge({ openWorkspace }),
      selectedRootPath: "E:/code/project",
    });

    fireEvent.click(screen.getByRole("button", { name: "选择打开方式" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Terminal" }));
    fireEvent.click(
      screen.getByRole("button", { name: "使用 Terminal 打开当前工作区" }),
    );

    await waitFor(() => {
      expect(openWorkspace).toHaveBeenCalledWith({
        path: "E:/code/project",
        opener: "terminal",
      });
    });
  });

  it("pushes an error banner when opening the workspace fails", async () => {
    const openWorkspace = vi.fn().mockRejectedValue(new Error("open failed"));
    renderControlledButton({
      hostBridge: createHostBridge({ openWorkspace }),
      selectedRootPath: "E:/code/project",
      initialOpener: "terminal",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "使用 Terminal 打开当前工作区" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Terminal 打开失败")).toBeInTheDocument();
    });
  });
});
