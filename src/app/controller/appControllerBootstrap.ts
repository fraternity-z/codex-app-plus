import type { AgentEnvironment, HostBridge } from "../../bridge/types";
import type { AppAction } from "../../domain/types";
import type { CollaborationModeListResponse } from "../../protocol/generated/v2/CollaborationModeListResponse";
import type { ConfigReadResponse } from "../../protocol/generated/v2/ConfigReadResponse";
import { listAllExperimentalFeatures } from "../../features/settings";
import { createConversationFromThreadSummary } from "../../features/conversation";
import { listAllThreads, loadThreadCatalog } from "../../features/workspace";
import { ProtocolClient } from "../../protocol/client";
import { refreshAccountState } from "./appControllerAccount";
import { toErrorMessage } from "./appControllerTypes";

type Dispatch = (action: AppAction) => void;

export function createAppServerStartInput(agentEnvironment: AgentEnvironment): { agentEnvironment: AgentEnvironment } {
  return { agentEnvironment };
}

export async function loadConversationCatalog(
  client: ProtocolClient,
  hostBridge: HostBridge,
  dispatch: Dispatch,
  agentEnvironment: AgentEnvironment,
): Promise<void> {
  const threads = await loadThreadCatalog(
    { request: (method, params) => client.request(method, params) },
    () => hostBridge.app.listCodexSessions({ agentEnvironment }),
    agentEnvironment,
  );
  dispatch({ type: "conversations/catalogLoaded", conversations: threads.map(createConversationFromThreadSummary) });
}

export async function loadBootstrapSnapshot(
  client: ProtocolClient,
  hostBridge: HostBridge,
  dispatch: Dispatch,
  agentEnvironment: AgentEnvironment,
): Promise<void> {
  const [, , config, collaborationModes, experimentalFeatures] = await Promise.all([
    refreshAccountState(client, dispatch),
    loadConversationCatalog(client, hostBridge, dispatch, agentEnvironment),
    client.request("config/read", { includeLayers: true }),
    client.request("collaborationMode/list", {}),
    listAllExperimentalFeatures(client),
  ]);
  dispatch({ type: "config/loaded", config: config as ConfigReadResponse });
  const response = collaborationModes as CollaborationModeListResponse;
  dispatch({
    type: "collaborationModes/loaded",
    modes: response.data.map((mode) => ({
      name: mode.name,
      mode: mode.mode,
      model: mode.model,
      reasoningEffort: mode.reasoning_effort,
    })),
  });
  dispatch({ type: "experimentalFeatures/loaded", features: experimentalFeatures });
}

export async function listArchivedThreads(client: ProtocolClient, agentEnvironment: AgentEnvironment) {
  return listAllThreads({ request: (method, params) => client.request(method, params) }, agentEnvironment, true);
}

export async function startOrReuseAppServer(client: ProtocolClient, agentEnvironment: AgentEnvironment): Promise<void> {
  try {
    await client.startAppServer(createAppServerStartInput(agentEnvironment));
  } catch (error) {
    if (!toErrorMessage(error).includes("already")) {
      throw error;
    }
  }
}
