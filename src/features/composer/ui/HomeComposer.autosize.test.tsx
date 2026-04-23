import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../model/composerPreferences";
import { AppStoreProvider, useAppStore } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";

const BASE_HEIGHT_PX = 52;
const LINE_HEIGHT_PX = 20;
const MAX_VISIBLE_HEIGHT_PX = 112;
const originalOffsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "offsetHeight");
const originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight");

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.5",
  label: "gpt-5.5",
  defaultEffort: "high",
  supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
  isDefault: true,
}];

function createGitController(): import("../../git/model/types").WorkspaceGitController {
  return {
    loading: false, pendingAction: null, status: null, statusLoaded: false, hasRepository: false, error: null, notice: null, commitDialogOpen: false, commitDialogError: null,
    branchRefsLoading: false, branchRefsLoaded: true, remoteUrlLoading: false, remoteUrlLoaded: true,
    commitMessage: "", selectedBranch: "", newBranchName: "", diff: null, diffCache: {}, diffTarget: null, loadingDiffKeys: [], staleDiffKeys: [],
    refresh: vi.fn().mockResolvedValue(undefined), initRepository: vi.fn().mockResolvedValue(undefined), fetch: vi.fn().mockResolvedValue(undefined), pull: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined), unstagePaths: vi.fn().mockResolvedValue(undefined), discardPaths: vi.fn().mockResolvedValue(undefined), commit: vi.fn().mockResolvedValue(undefined), openCommitDialog: vi.fn(), closeCommitDialog: vi.fn(),
    checkoutBranch: vi.fn().mockResolvedValue(true), deleteBranch: vi.fn().mockResolvedValue(true), createBranchFromName: vi.fn().mockResolvedValue(true), checkoutSelectedBranch: vi.fn().mockResolvedValue(true), createBranch: vi.fn().mockResolvedValue(true),
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined), ensureRemoteUrl: vi.fn().mockResolvedValue(undefined), ensureDiff: vi.fn().mockResolvedValue(undefined), selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(), setCommitMessage: vi.fn(), setSelectedBranch: vi.fn(), setNewBranchName: vi.fn(),
  };
}

function ComposerHarness(): JSX.Element {
  const { dispatch } = useAppStore();
  const [inputText, setInputText] = useState("");
  const composerCommandBridge = useMemo<ComposerCommandBridge>(() => ({
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn(async ({ sessionId, query }) => {
      dispatch({ type: "fuzzySearch/updated", sessionId, query, files: [] });
    }),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue({}),
  }), [dispatch]);

  return (
    <HomeComposer
      busy={false}
      inputText={inputText}
      collaborationPreset="default"
      models={MODELS}
      defaultModel="gpt-5.5"
      defaultEffort="high"
      selectedRootPath="E:/code/codex-app-plus"
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel="default"
      gitController={createGitController()}
      selectedThreadId="thread-1"
      selectedThreadBranch={null}
      isResponding={false}
      interruptPending={false}
      composerCommandBridge={composerCommandBridge}
      onSelectCollaborationPreset={vi.fn()}
      onInputChange={setInputText}
      onCreateThread={vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
      onSelectPermissionLevel={vi.fn()}
      onToggleDiff={vi.fn()}
      onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
    />
  );
}

function installTextareaMeasurements(): void {
  Object.defineProperty(HTMLTextAreaElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return BASE_HEIGHT_PX;
    },
  });
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      const textarea = this as HTMLTextAreaElement;
      const lineCount = Math.max(textarea.value.split("\n").length, 1);
      return BASE_HEIGHT_PX + (Math.max(0, lineCount - 1) * LINE_HEIGHT_PX);
    },
  });
  vi.spyOn(window, "getComputedStyle").mockReturnValue({ lineHeight: `${LINE_HEIGHT_PX}px` } as CSSStyleDeclaration);
}

function restoreDescriptor(target: HTMLTextAreaElement, key: "offsetHeight" | "scrollHeight", descriptor?: PropertyDescriptor): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
    return;
  }
  Object.defineProperty(target, key, descriptor);
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreDescriptor(HTMLTextAreaElement.prototype, "offsetHeight", originalOffsetHeightDescriptor);
  restoreDescriptor(HTMLTextAreaElement.prototype, "scrollHeight", originalScrollHeightDescriptor);
});

describe("HomeComposer autosize", () => {
  it("grows with content until three extra lines, then enables internal scrolling", async () => {
    installTextareaMeasurements();
    render(<AppStoreProvider><ComposerHarness /></AppStoreProvider>, { wrapper: createI18nWrapper() });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    await waitFor(() => expect(textarea.style.height).toBe(`${BASE_HEIGHT_PX}px`));
    expect(textarea.style.overflowY).toBe("hidden");

    fireEvent.change(textarea, { target: { value: "1\n2\n3\n4", selectionStart: 7 } });

    await waitFor(() => expect(textarea.style.height).toBe(`${MAX_VISIBLE_HEIGHT_PX}px`));
    expect(textarea.style.overflowY).toBe("hidden");

    fireEvent.change(textarea, { target: { value: "1\n2\n3\n4\n5", selectionStart: 9 } });

    await waitFor(() => expect(textarea.style.height).toBe(`${MAX_VISIBLE_HEIGHT_PX}px`));
    expect(textarea.style.overflowY).toBe("auto");
  });
});
