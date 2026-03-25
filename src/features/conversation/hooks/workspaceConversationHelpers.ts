import type { CollaborationMode } from "../../../protocol/generated/CollaborationMode";
import type { ConversationState } from "../../../domain/conversation";
import type { CollaborationModePreset, ComposerAttachment, QueuedFollowUp } from "../../../domain/timeline";
import type { Turn } from "../../../protocol/generated/v2/Turn";
import type { UserInput } from "../../../protocol/generated/v2/UserInput";
import type { ComposerSelection } from "../../composer/model/composerPreferences";
import { buildComposerUserInputs } from "../../composer/model/composerAttachments";
import { resolveAgentWorkspacePath } from "../../workspace/model/workspacePath";
import { resolveCollaborationModePreset } from "../model/collaborationModeResolver";
import type { SendTurnOptions } from "./workspaceConversationTypes";

export function resolveConversationCwd(cwd: string | null, agentEnvironment: "windowsNative" | "wsl"): string | null {
  return cwd === null ? null : resolveAgentWorkspacePath(cwd, agentEnvironment);
}

export function createInput(
  text: string,
  attachments: ReadonlyArray<ComposerAttachment>,
  agentEnvironment: "windowsNative" | "wsl",
): Array<UserInput> {
  return buildComposerUserInputs(text, attachments, agentEnvironment);
}

export function createQueuedFollowUp(options: SendTurnOptions): QueuedFollowUp {
  return {
    id: `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    text: options.text.trim(),
    attachments: options.attachments,
    model: options.selection.model,
    effort: options.selection.effort,
    serviceTier: options.selection.serviceTier,
    permissionLevel: options.permissionLevel,
    collaborationPreset: options.collaborationPreset,
    mode: options.followUpOverride ?? "queue",
    createdAt: new Date().toISOString(),
  };
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildInterruptedTurn(conversation: ConversationState | null, turnId: string): Turn | null {
  const turn = conversation?.turns.find((entry) => entry.turnId === turnId) ?? null;
  if (turn === null || turn.turnId === null) {
    return null;
  }
  return {
    id: turn.turnId,
    items: turn.items.map((itemState) => itemState.item),
    status: "interrupted",
    error: null,
  };
}

function resolvePlanMode(modes: ReadonlyArray<CollaborationModePreset>, selection: ComposerSelection): CollaborationMode | undefined {
  const preset = modes.find((mode) => mode.mode === "plan") ?? null;
  if (preset === null) {
    throw new Error("当前 app-server 未暴露 plan 模式 preset。");
  }
  return {
    mode: "plan",
    settings: {
      model: preset.model ?? selection.model ?? "",
      reasoning_effort: preset.reasoningEffort ?? selection.effort ?? null,
      developer_instructions: null,
    },
  };
}

export function resolveRequestedCollaborationMode(
  modes: ReadonlyArray<CollaborationModePreset>,
  sendOptions: SendTurnOptions,
): CollaborationMode | undefined {
  const overridePreset = sendOptions.collaborationModeOverridePreset;
  if (overridePreset) {
    return resolveCollaborationModePreset(modes, overridePreset, sendOptions.selection);
  }
  if (sendOptions.collaborationPreset !== "plan") {
    return undefined;
  }
  return resolvePlanMode(modes, sendOptions.selection);
}
