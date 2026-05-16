import { useCallback, useEffect, useMemo, useRef } from "react";
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

export interface AutomationRunnerController {
  readonly runAutomationNow: (automationId: string) => Promise<void>;
}

export function useAutomationRunner(options: UseAutomationRunnerOptions): AutomationRunnerController {
  const dispatch = useAppDispatch();
  const runningAutomationIds = useRef(new Set<string>());
  const {
    agentEnvironment,
    appServerClient,
    appServerReady,
    automations,
    defaultEffort,
    defaultModel,
    defaultServiceTier,
    permissionSettings,
    recordAutomationRunResult,
  } = options;

  const runAutomation = useCallback(async (automation: AutomationRecord) => {
    const model = automation.model ?? defaultModel;
    const effort = automation.effort ?? defaultEffort;
    const serviceTier = automation.serviceTier ?? defaultServiceTier ?? null;
    if (!appServerReady || model === null) {
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
        agentEnvironment,
      );
      const threadResponse = await appServerClient.request("thread/start", {
        model,
        serviceTier,
        cwd: agentWorkspacePath,
        experimentalRawEvents: false,
        persistExtendedHistory: false,
        ...createThreadPermissionOverrides("default", permissionSettings),
      }) as ThreadStartResponse;
      const conversation = createConversationFromThread(threadResponse.thread, {
        hidden: false,
        resumeState: "resumed",
        agentEnvironment,
      });
      dispatch({ type: "conversation/upserted", conversation });
      dispatch({ type: "conversation/titleChanged", conversationId: conversation.id, title: automation.name });

      const cwd = threadResponse.thread.cwd || threadResponse.cwd || agentWorkspacePath;
      const input = createInput(automation.prompt, [], agentEnvironment);
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
      const turnResponse = await appServerClient.request("turn/start", {
        threadId: conversation.id,
        model,
        effort: effort ?? undefined,
        serviceTier,
        cwd: resolveConversationCwd(cwd, agentEnvironment) ?? undefined,
        input,
        ...createTurnPermissionOverrides("default", permissionSettings),
      }) as TurnStartResponse;
      dispatch({ type: "conversation/turnStarted", conversationId: conversation.id, turn: turnResponse.turn });
      dispatch({ type: "conversation/touched", conversationId: conversation.id, updatedAt: runAt.toISOString() });
      recordAutomationRunResult(automation.id, { runAt, error: null });
    } catch (error) {
      recordAutomationRunResult(automation.id, {
        runAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      runningAutomationIds.current.delete(automation.id);
    }
  }, [
    agentEnvironment,
    appServerClient,
    appServerReady,
    defaultEffort,
    defaultModel,
    defaultServiceTier,
    dispatch,
    permissionSettings,
    recordAutomationRunResult,
  ]);

  const runAutomationNow = useCallback(async (automationId: string) => {
    const automation = automations.find((item) => item.id === automationId);
    if (automation === undefined) {
      return;
    }
    await runAutomation(automation);
  }, [automations, runAutomation]);

  const runDueAutomations = useCallback(() => {
    if (!appServerReady || defaultModel === null) {
      return;
    }
    const now = new Date();
    for (const automation of automations) {
      if (isAutomationDue(automation, now)) {
        void runAutomation(automation);
      }
    }
  }, [appServerReady, automations, defaultModel, runAutomation]);

  useEffect(() => {
    runDueAutomations();
    const intervalId = window.setInterval(runDueAutomations, AUTOMATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [runDueAutomations]);

  return useMemo(() => ({
    runAutomationNow,
  }), [runAutomationNow]);
}
