import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { CustomPromptOutput } from "../../../bridge/types";
import { AppStoreProvider, useAppStore } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";
import { INIT_COMMAND_PROMPT } from "../service/composerInitCommand";
import { createI18nWrapper } from "../../../test/createI18nWrapper";

const MODELS: ReadonlyArray<ComposerModelOption> = [
  { id: "model-1", value: "gpt-5.2", label: "GPT-5.2", defaultEffort: "medium", supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"], isDefault: true },
  { id: "model-2", value: "gpt-5.4", label: "gpt-5.4", defaultEffort: "high", supportedEfforts: ["low", "medium", "high", "xhigh"], isDefault: false },
];

function createGitController(): import("../../git/model/types").WorkspaceGitController {
  return {
    loading: false, pendingAction: null, status: null, statusLoaded: false, hasRepository: false, error: null, notice: null, commitDialogOpen: false, commitDialogError: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "", selectedBranch: "", newBranchName: "", diff: null, diffCache: {}, diffTarget: null, loadingDiffKeys: [], staleDiffKeys: [],
    refresh: vi.fn().mockResolvedValue(undefined), initRepository: vi.fn().mockResolvedValue(undefined), fetch: vi.fn().mockResolvedValue(undefined), pull: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined), unstagePaths: vi.fn().mockResolvedValue(undefined), discardPaths: vi.fn().mockResolvedValue(undefined), commit: vi.fn().mockResolvedValue(undefined), openCommitDialog: vi.fn(), closeCommitDialog: vi.fn(),
    checkoutBranch: vi.fn().mockResolvedValue(true), deleteBranch: vi.fn().mockResolvedValue(true), createBranchFromName: vi.fn().mockResolvedValue(true), checkoutSelectedBranch: vi.fn().mockResolvedValue(true), createBranch: vi.fn().mockResolvedValue(true),
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
    ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
    ensureDiff: vi.fn().mockResolvedValue(undefined), selectDiff: vi.fn().mockResolvedValue(undefined), clearDiff: vi.fn(), setCommitMessage: vi.fn(), setSelectedBranch: vi.fn(), setNewBranchName: vi.fn(),
  };
}

function ComposerHarness(props: {
  readonly selectedRootPath?: string | null;
  readonly isResponding?: boolean;
  readonly onCreateThread?: ReturnType<typeof vi.fn>;
  readonly onToggleDiff?: ReturnType<typeof vi.fn>;
  readonly onSelectCollaborationPreset?: ReturnType<typeof vi.fn>;
  readonly onSendTurn?: ReturnType<typeof vi.fn>;
  readonly request?: ReturnType<typeof vi.fn>;
  readonly customPrompts?: ReadonlyArray<CustomPromptOutput>;
}): JSX.Element {
  const { dispatch } = useAppStore();
  const [inputText, setInputText] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>("default");
  const composerCommandBridge = useMemo<ComposerCommandBridge>(() => ({
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn(async ({ sessionId, query }) => {
      dispatch({ type: "fuzzySearch/updated", sessionId, query, files: [{ root: "E:/code/codex-app-plus", path: "src/App.tsx", file_name: "App.tsx", score: 1, indices: null }] });
    }),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: props.request ?? vi.fn().mockResolvedValue({}),
  }), [dispatch, props.request]);
  useEffect(() => {
    dispatch({ type: "customPrompts/loaded", prompts: [...(props.customPrompts ?? [])] });
  }, [dispatch, props.customPrompts]);

  return (
    <HomeComposer
      busy={false}
      inputText={inputText}
      collaborationPreset="default"
      models={MODELS}
      defaultModel="gpt-5.2"
      defaultEffort="medium"
      selectedRootPath={props.selectedRootPath === undefined ? "E:/code/codex-app-plus" : props.selectedRootPath}
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel={permissionLevel}
      gitController={createGitController()}
      selectedThreadId="thread-1"
      selectedThreadBranch={null}
      isResponding={props.isResponding ?? false}
      interruptPending={false}
      composerCommandBridge={composerCommandBridge}
      onSelectCollaborationPreset={props.onSelectCollaborationPreset ?? vi.fn()}
      onInputChange={setInputText}
      onCreateThread={props.onCreateThread ?? vi.fn().mockResolvedValue(undefined)}
      onSendTurn={props.onSendTurn ?? vi.fn().mockResolvedValue(undefined)}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onSelectPermissionLevel={setPermissionLevel}
      onToggleDiff={props.onToggleDiff ?? vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
    />
  );
}

function renderHarness(props?: Parameters<typeof ComposerHarness>[0]) {
  return render(<AppStoreProvider><ComposerHarness {...props} /></AppStoreProvider>, { wrapper: createI18nWrapper("en-US") });
}

describe("HomeComposer commands", () => {
  it("executes /init by sending the official init prompt and clears the input", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({});
    renderHarness({ onSendTurn, request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/init", selectionStart: 5 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith({
      text: INIT_COMMAND_PROMPT,
      attachments: [],
      selection: { model: "gpt-5.2", effort: "medium", serviceTier: null },
      permissionLevel: "default",
      collaborationPreset: "default",
    }));
    expect(request).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("clicking /init in the palette sends the same prompt", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({});
    renderHarness({ onSendTurn, request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/init", selectionStart: 5 } });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /\/init/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("menuitem", { name: /\/init/i }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: INIT_COMMAND_PROMPT,
    })));
    expect(request).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("still executes /init even if request mocks imply the workspace already has AGENTS.md", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({
      entries: [{ fileName: "AGENTS.md", isDirectory: false, isFile: true }],
    });
    renderHarness({ onSendTurn, request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/init", selectionStart: 5 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      text: INIT_COMMAND_PROMPT,
    })));
    expect(request).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /new immediately", async () => {
    const onCreateThread = vi.fn().mockResolvedValue(undefined);
    renderHarness({ onCreateThread });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/new", selectionStart: 4 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onCreateThread).toHaveBeenCalled());
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /clear immediately", async () => {
    const onCreateThread = vi.fn().mockResolvedValue(undefined);
    renderHarness({ onCreateThread });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/clear", selectionStart: 6 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onCreateThread).toHaveBeenCalled());
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /diff immediately", async () => {
    const onToggleDiff = vi.fn();
    renderHarness({ onToggleDiff });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/diff", selectionStart: 5 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onToggleDiff).toHaveBeenCalled());
  });

  it("opens the permissions picker from /approvals", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/approvals", selectionStart: 10 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("menu", { name: "Choose permissions" })).toBeInTheDocument());
  });

  it("executes /rename with inline arguments through the official request path", async () => {
    const request = vi.fn().mockResolvedValue({});
    renderHarness({ request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/rename slash command rollout", selectionStart: 29 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(request).toHaveBeenCalledWith("thread/name/set", {
      threadId: "thread-1",
      name: "slash command rollout",
    }));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("switches the composer preset when /plan is executed", async () => {
    const onSelectCollaborationPreset = vi.fn();
    renderHarness({ onSelectCollaborationPreset });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/plan", selectionStart: 5 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onSelectCollaborationPreset).toHaveBeenCalledWith("plan"));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /clean through the canonical /stop request path", async () => {
    const request = vi.fn().mockResolvedValue({});
    renderHarness({ request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/clean", selectionStart: 6 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(request).toHaveBeenCalledWith("thread/backgroundTerminals/clean", {
      threadId: "thread-1",
    }));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("executes /plugins through the official request path", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "plugin/list") {
        return { marketplaces: [], remoteSyncError: null };
      }
      return {};
    });
    renderHarness({ request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/plugins", selectionStart: 8 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(request).toHaveBeenCalledWith("plugin/list", {
      cwds: ["E:/code/codex-app-plus"],
      forceRemoteSync: true,
    }));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("shows /new as unavailable while the assistant is responding", async () => {
    const onCreateThread = vi.fn().mockResolvedValue(undefined);
    renderHarness({ isResponding: true, onCreateThread });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/new", selectionStart: 4 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /\/new/i })).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByText("当前有任务正在执行，官方不允许这条命令在运行中使用。")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onCreateThread).not.toHaveBeenCalled();
  });

  it("shows no command match after /theme is removed", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/theme", selectionStart: 6 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /No matching commands/i })).toBeInTheDocument());
    expect(screen.queryByRole("menuitem", { name: /\/theme/i })).not.toBeInTheDocument();
  });

  it("shows custom prompts in the palette and inserts the command template", async () => {
    renderHarness({
      customPrompts: [{
        name: "draft-pr",
        path: "~/.codex/prompts/draft-pr.md",
        content: "Create a draft PR for $BRANCH",
        description: "创建草稿 PR",
        argumentHint: null,
      }],
    });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/draft", selectionStart: 6 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /\/prompts:draft-pr/i })).toBeInTheDocument());

    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe('/prompts:draft-pr BRANCH=""'));
  });

  it("completes slash command with Tab and appends trailing space", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/comp", selectionStart: 5 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /\/compact/i })).toBeInTheDocument());
    fireEvent.keyDown(textarea, { key: "Tab" });

    await waitFor(() => expect(textarea.value).toBe("/compact "));
    expect(textarea.selectionStart).toBe(textarea.value.length);
  });

  it("completes hovered slash command with Tab", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/comp", selectionStart: 5 } });

    const compactItem = await screen.findByRole("menuitem", { name: /\/compact/i });
    fireEvent.mouseEnter(compactItem);
    fireEvent.keyDown(textarea, { key: "Tab" });

    await waitFor(() => expect(textarea.value).toBe("/compact "));
  });

  it("completes mention with Tab and appends trailing space", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@app", selectionStart: 4 } });

    await waitFor(() => expect(screen.getByRole("menu", { name: "Mention file" })).toBeInTheDocument());
    fireEvent.keyDown(textarea, { key: "Tab" });

    await waitFor(() => expect(textarea.value).toBe("@src/App.tsx "));
  });

  it("completes skill with Tab and appends trailing space", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "skills/list") {
        return {
          data: [{
            source: "workspace",
            skills: [{
              name: "compact-skill",
              description: "skill desc",
              scope: "project",
              path: "skills/compact-skill",
              enabled: true,
            }],
          }],
        };
      }
      return {};
    });
    renderHarness({ request });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "$c", selectionStart: 2 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /\$compact-skill/i })).toBeInTheDocument());
    fireEvent.keyDown(textarea, { key: "Tab" });

    await waitFor(() => expect(textarea.value).toBe("$compact-skill "));
  });

  it("does not complete disabled items with Tab", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/theme", selectionStart: 6 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /No matching commands/i })).toBeInTheDocument());
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(textarea.value).toBe("/theme");
  });

  it("fills the first item with Tab when no hover happened", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/comp", selectionStart: 5 } });

    await waitFor(() => expect(screen.getByRole("menuitem", { name: /\/compact/i })).toBeInTheDocument());
    fireEvent.keyDown(textarea, { key: "Tab" });

    await waitFor(() => expect(textarea.value).toBe("/compact "));
  });

  it("hides slash palette once a non-inline-args command is followed by a space", async () => {
    renderHarness();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "/compact ", selectionStart: 9 } });

    await waitFor(() => expect(screen.queryByRole("menu", { name: "Run command" })).not.toBeInTheDocument());
  });

  it("opens mention results from @ and renders the file as a chip while sending the path in text", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    renderHarness({ onSendTurn });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "@app", selectionStart: 4 } });

    await waitFor(() => expect(screen.getByRole("menu", { name: "Mention file" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("menuitem", { name: /App.tsx/ }));

    await waitFor(() => expect(screen.getByText("App.tsx")).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [],
    })));
  });

  it("shows an explicit error when @ is used without a workspace", async () => {
    renderHarness({ selectedRootPath: null });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "@app", selectionStart: 4 } });

    await waitFor(() => expect(screen.getAllByText("Choose a workspace before using @ file mentions.").length).toBeGreaterThan(0));
  });
});
