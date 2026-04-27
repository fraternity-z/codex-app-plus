import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { CustomPromptOutput } from "../../../bridge/types";
import { AppStoreProvider, useAppSelector, useAppStore } from "../../../state/store";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { setComposerDictationTranscriberForTest } from "../service/composerDictationTranscription";
import { HomeComposer } from "./HomeComposer";
import { INIT_COMMAND_PROMPT } from "../service/composerInitCommand";
import { createI18nWrapper } from "../../../test/createI18nWrapper";

type RenderHarnessProps = Parameters<typeof ComposerHarness>[0];

const MODELS: ReadonlyArray<ComposerModelOption> = [
  { id: "model-1", value: "gpt-5.5", label: "gpt-5.5", defaultEffort: "high", supportedEfforts: ["low", "medium", "high", "xhigh"], isDefault: true },
  { id: "model-2", value: "gpt-5.3-codex", label: "GPT-5.3-Codex", defaultEffort: "high", supportedEfforts: ["low", "medium", "high", "xhigh"], isDefault: false },
];

function createGitController(): import("../../git/model/types").WorkspaceGitController {
  return {
    loading: false, pendingAction: null, status: null, statusLoaded: false, hasRepository: false, error: null, notice: null, commitDialogOpen: false, commitDialogError: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "", commitInstructions: "", selectedBranch: "", newBranchName: "", diff: null, diffCache: {}, diffTarget: null, loadingDiffKeys: [], staleDiffKeys: [],
    refresh: vi.fn().mockResolvedValue(undefined), initRepository: vi.fn().mockResolvedValue(undefined), fetch: vi.fn().mockResolvedValue(undefined), pull: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined), unstagePaths: vi.fn().mockResolvedValue(undefined), discardPaths: vi.fn().mockResolvedValue(undefined), commit: vi.fn().mockResolvedValue(undefined), openCommitDialog: vi.fn(), closeCommitDialog: vi.fn(),
    checkoutBranch: vi.fn().mockResolvedValue(true), deleteBranch: vi.fn().mockResolvedValue(true), createBranchFromName: vi.fn().mockResolvedValue(true), checkoutSelectedBranch: vi.fn().mockResolvedValue(true), createBranch: vi.fn().mockResolvedValue(true),
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
    ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
    ensureDiff: vi.fn().mockResolvedValue(undefined), selectDiff: vi.fn().mockResolvedValue(undefined), clearDiff: vi.fn(), setCommitMessage: vi.fn(), setSelectedBranch: vi.fn(), setNewBranchName: vi.fn(),
  };
}

function ComposerHarness(props: {
  readonly appServerReady?: boolean;
  readonly selectedRootPath?: string | null;
  readonly isResponding?: boolean;
  readonly onCreateThread?: ReturnType<typeof vi.fn>;
  readonly onToggleDiff?: ReturnType<typeof vi.fn>;
  readonly onSelectCollaborationPreset?: ReturnType<typeof vi.fn>;
  readonly onSendTurn?: ReturnType<typeof vi.fn>;
  readonly request?: ReturnType<typeof vi.fn>;
  readonly selectedThreadId?: string | null;
  readonly customPrompts?: ReadonlyArray<CustomPromptOutput>;
}): JSX.Element {
  const { dispatch } = useAppStore();
  const [inputText, setInputText] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>("default");
  const composerCommandBridge = useMemo<ComposerCommandBridge>(() => ({
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn(async ({ sessionId, query }) => {
      dispatch({
        type: "fuzzySearch/updated",
        sessionId,
        query,
        files: [{
          root: "E:/code/codex-app-plus",
          path: "src/App.tsx",
          match_type: "file",
          file_name: "App.tsx",
          score: 1,
          indices: null
        }]
      });
    }),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: props.request ?? vi.fn().mockResolvedValue({}),
  }), [dispatch, props.request]);
  useEffect(() => {
    dispatch({ type: "customPrompts/loaded", prompts: [...(props.customPrompts ?? [])] });
  }, [dispatch, props.customPrompts]);

  return (
    <HomeComposer
      appServerReady={props.appServerReady}
      busy={false}
      inputText={inputText}
      collaborationPreset="default"
      models={MODELS}
      defaultModel="gpt-5.5"
      defaultEffort="high"
      selectedRootPath={props.selectedRootPath === undefined ? "E:/code/codex-app-plus" : props.selectedRootPath}
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel={permissionLevel}
      gitController={createGitController()}
      selectedThreadId={props.selectedThreadId === undefined ? "thread-1" : props.selectedThreadId}
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

function renderHarness(props?: RenderHarnessProps) {
  function BannerProbe(): JSX.Element | null {
    const latestBanner = useAppSelector((state) => state.banners[0] ?? null);
    return latestBanner === null ? null : <span>{latestBanner.detail ?? latestBanner.title}</span>;
  }

  return render(<AppStoreProvider><ComposerHarness {...props} /><BannerProbe /></AppStoreProvider>, { wrapper: createI18nWrapper("en-US") });
}

class MockScriptProcessor {
  onaudioprocess: ((event: {
    readonly inputBuffer: { getChannelData: (channel: number) => Float32Array };
    readonly outputBuffer: { getChannelData: (channel: number) => Float32Array };
  }) => void) | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  emit(samples: Float32Array): void {
    this.onaudioprocess?.({
      inputBuffer: { getChannelData: () => samples },
      outputBuffer: { getChannelData: () => new Float32Array(samples.length) },
    });
  }
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  readonly sampleRate = 16000;
  readonly destination = {};
  readonly processor = new MockScriptProcessor();
  readonly source = { connect: vi.fn(), disconnect: vi.fn() };
  readonly close = vi.fn().mockResolvedValue(undefined);

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createMediaStreamSource(): { readonly connect: ReturnType<typeof vi.fn>; readonly disconnect: ReturnType<typeof vi.fn> } {
    return this.source;
  }

  createScriptProcessor(): MockScriptProcessor {
    return this.processor;
  }
}

function setGlobalProperty(name: string, value: unknown): () => void {
  const hadValue = Object.prototype.hasOwnProperty.call(globalThis, name);
  const previousValue = Reflect.get(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (hadValue) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: previousValue,
      });
      return;
    }
    Reflect.deleteProperty(globalThis, name);
  };
}

function setObjectProperty(target: object, name: string, value: unknown): () => void {
  const hadValue = Object.prototype.hasOwnProperty.call(target, name);
  const previousValue = Reflect.get(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (hadValue) {
      Object.defineProperty(target, name, {
        configurable: true,
        writable: true,
        value: previousValue,
      });
      return;
    }
    Reflect.deleteProperty(target, name);
  };
}

function installMockAudioRecorder(args?: {
  readonly getUserMedia?: ReturnType<typeof vi.fn>;
  readonly transcript?: string;
}): () => void {
  MockAudioContext.instances = [];
  const stopTrack = vi.fn();
  const getUserMedia = args?.getUserMedia ?? vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
  });
  const restoreMediaDevices = setObjectProperty(navigator, "mediaDevices", { getUserMedia });
  const restoreAudioContext = setGlobalProperty("AudioContext", MockAudioContext);
  setComposerDictationTranscriberForTest(vi.fn().mockResolvedValue(args?.transcript ?? "hello world"));
  return () => {
    restoreMediaDevices();
    restoreAudioContext();
    setComposerDictationTranscriberForTest(null);
    MockAudioContext.instances = [];
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  setComposerDictationTranscriberForTest(null);
  MockAudioContext.instances = [];
});

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
      selection: { model: "gpt-5.5", effort: "high", serviceTier: null },
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
        return { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] };
      }
      return {};
    });
    renderHarness({ request });
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/plugins", selectionStart: 8 } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(request).toHaveBeenCalledWith("plugin/list", {
      cwds: ["E:/code/codex-app-plus"],
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

  it("reports why dictation cannot start when audio recording is unavailable", async () => {
    renderHarness();

    const button = screen.getByRole("button", { name: "Dictation unavailable" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Audio recording is not available in this environment.")).toBeInTheDocument());
  });

  it("records dictation and inserts transcribed speech into the composer after stopping", async () => {
    const restoreAudioRecorder = installMockAudioRecorder({ transcript: "hello world" });
    try {
      renderHarness();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));

      await waitFor(() => expect(MockAudioContext.instances).toHaveLength(1));
      expect(screen.getByTestId("composer-dictation-waveform")).toHaveAttribute("data-speaking", "false");
      expect(screen.getByText("0:00")).toBeInTheDocument();

      act(() => MockAudioContext.instances[0].processor.emit(new Float32Array([0.2, -0.2, 0.18, -0.18])));
      expect(textarea.value).toBe("");

      fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
      expect(screen.getByRole("button", { name: "Transcribing dictation" })).toHaveAttribute("aria-busy", "true");
      await waitFor(() => expect(textarea.value).toBe("hello world"));
      await waitFor(() => expect(screen.getByRole("button", { name: "Start dictation" })).toBeInTheDocument());
    } finally {
      restoreAudioRecorder();
    }
  });

  it("appends dictated text with natural spacing", async () => {
    const restoreAudioRecorder = installMockAudioRecorder({ transcript: "the diff" });
    try {
      renderHarness();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "Review", selectionStart: 6 } });
      fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
      await waitFor(() => expect(MockAudioContext.instances).toHaveLength(1));
      act(() => MockAudioContext.instances[0].processor.emit(new Float32Array([0.2, -0.2])));

      expect(textarea.value).toBe("Review");
      fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
      await waitFor(() => expect(textarea.value).toBe("Review the diff"));
    } finally {
      restoreAudioRecorder();
    }
  });

  it("stops an active dictation session from the microphone button", async () => {
    const restoreAudioRecorder = installMockAudioRecorder();
    try {
      renderHarness();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      textarea.focus();

      fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
      await waitFor(() => expect(MockAudioContext.instances).toHaveLength(1));
      act(() => MockAudioContext.instances[0].processor.emit(new Float32Array([0.2, -0.2])));

      fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

      expect(screen.getByRole("button", { name: "Transcribing dictation" })).toHaveAttribute("aria-busy", "true");
      await waitFor(() => expect(screen.getByRole("button", { name: "Start dictation" })).toBeInTheDocument());
      await waitFor(() => expect(document.activeElement).toBe(textarea));
    } finally {
      restoreAudioRecorder();
    }
  });

  it("uses microphone levels for waveform feedback and releases the stream when stopped", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });
    const restoreAudioRecorder = installMockAudioRecorder({ getUserMedia });
    try {
      renderHarness({ appServerReady: false });

      fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));

      await waitFor(() => expect(MockAudioContext.instances).toHaveLength(1));
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      }));

      act(() => MockAudioContext.instances[0].processor.emit(new Float32Array([0.2, -0.2, 0.18, -0.18])));
      await waitFor(() => expect(screen.getByTestId("composer-dictation-waveform")).toHaveAttribute("data-speaking", "true"));

      fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

      await waitFor(() => expect(screen.queryByTestId("composer-dictation-waveform")).not.toBeInTheDocument());
      expect(stopTrack).toHaveBeenCalled();
      expect(MockAudioContext.instances[0].close).toHaveBeenCalled();
    } finally {
      restoreAudioRecorder();
    }
  });

  it("shows an actionable permission message when microphone access is denied", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const restoreAudioRecorder = installMockAudioRecorder({ getUserMedia });
    try {
      renderHarness({ appServerReady: false });

      fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));

      await waitFor(() => expect(screen.getByText(/Microphone access is blocked/)).toBeInTheDocument());
    } finally {
      restoreAudioRecorder();
    }
  });
});
