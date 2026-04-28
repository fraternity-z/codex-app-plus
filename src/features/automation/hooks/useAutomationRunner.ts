import { useCallback, useEffect, useRef } from "react";
import type { AgentEnvironment } from "../../../bridge/types";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { ThreadStartResponse } from "../../../protocol/generated/v2/ThreadStartResponse";
import type { TurnStartResponse } from "../../../protocol/generated/v2/TurnStartResponse";
import { useAppDispatch } from "../../../state/store";
import {
  createThreadPermissionOverrides,
  createTurnPermissionOverrides,
  type ComposerPermissionSettings,
} from "../../composer/model/composerPermission";
import type { ComposerSelection } from "../../composer/model/composerPreferences";
import { createConversationFromThread } from "../../conversation/model/conversationState";
import { createInput, resolveConversationCwd } from "../../conversation/hooks/workspaceConversationHelpers";
import { resolveAgentWorkspacePath } from "../../workspace/model/workspacePath";
import { isAutomationDue, type AutomationRecord } from "../model/automations";

interface UseAutomationRunnerOptions {
  readonly agentEnvironment: AgentEnvironment;
  readonly appServerClient: AppServerClient;
  readonly appServerReady: boolean;
  readonly automations: ReadonlyArray<AutomationRecord>;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultModel: string | null;
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
  readonly permissionSettings: ComposerPermissionSettings;
  readonly recordAutomationRunResult: (
    automationId: string,
    result: { readonly runAt: Date; readonly error: string | null },
  ) => void;
}

const AUTOMATION_POLL_INTERVAL_MS = 60_000;

export function useAutomationRunner(options: UseAutomationRunnerOptions): void {
  const dispatch = useAppDispatch();
  const runningAutomationIds = useRef(new Set<string>());

  const runAutomation = useCallback(async (automation: AutomationRecord) => {
    const model = automation.model ?? options.defaultModel;
    const effort = automation.effort ?? options.defaultEffort;
    const serviceTier = automation.serviceTier ?? options.defaultServiceTier ?? null;
    if (!options.appServerReady || model === null) {
      return;
    }
    if (runningAutomationIds.current.has(automation.id)) {
      return;
    }
    runningAutomationIds.current.add(automation.id);
    const runAt = new Date();
    try {
      const agentWorkspacePath = resolveAgentWorkspacePath(
        automation.workspacePath,
        options.agentEnvironment,
      );
      const threadResponse = await options.appServerClient.request("thread/start", {
        model,
        serviceTier,
        cwd: agentWorkspacePath,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
        ...createThreadPermissionOverrides("default", options.permissionSettings),
      }) as ThreadStartResponse;
      const conversation = createConversationFromThread(threadResponse.thread, {
        hidden: false,
        resumeState: "resumed",
        agentEnvironment: options.agentEnvironment,
      });
      dispatch({ type: "conversation/upserted", conversation });
      dispatch({ type: "conversation/titleChanged", conversationId: conversation.id, title: automation.name });

      const cwd = threadResponse.thread.cwd || threadResponse.cwd || agentWorkspacePath;
      const input = createInput(automation.prompt, [], options.agentEnvironment);
      dispatch({
        type: "conversation/turnPlaceholderAdded",
        conversationId: conversation.id,
        params: {
          input,
          cwd: resolveConversationCwd(cwd, options.agentEnvironment),
          model,
          effort,
          serviceTier,
          collaborationMode: null,
        },
      });
      const turnResponse = await options.appServerClient.request("turn/start", {
        threadId: conversation.id,
        model,
        effort: effort ?? undefined,
        serviceTier,
        cwd: resolveConversationCwd(cwd, options.agentEnvironment) ?? undefined,
        input,
        ...createTurnPermissionOverrides("default", options.permissionSettings),
      }) as TurnStartResponse;
      dispatch({ type: "conversation/turnStarted", conversationId: conversation.id, turn: turnResponse.turn });
      dispatch({ type: "conversation/touched", conversationId: conversation.id, updatedAt: runAt.toISOString() });
      options.recordAutomationRunResult(automation.id, { runAt, error: null });
    } catch (error) {
      options.recordAutomationRunResult(automation.id, {
        runAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      runningAutomationIds.current.delete(automation.id);
    }
  }, [
    dispatch,
    options,
  ]);

  const runDueAutomations = useCallback(() => {
    if (!options.appServerReady || options.defaultModel === null) {
      return;
    }
    const now = new Date();
    for (const automation of options.automations) {
      if (isAutomationDue(automation, now)) {
        void runAutomation(automation);
      }
    }
  }, [options.appServerReady, options.automations, options.defaultModel, runAutomation]);

  useEffect(() => {
    runDueAutomations();
    const intervalId = window.setInterval(runDueAutomations, AUTOMATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [runDueAutomations]);
}
