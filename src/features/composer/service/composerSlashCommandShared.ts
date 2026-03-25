import type { Dispatch } from "react";
import type { AppAction, AccountSummary, RealtimeState } from "../../../domain/types";
import type { NoticeLevel } from "../../../domain/timeline";
import type { GetAccountResponse } from "../../../protocol/generated/v2/GetAccountResponse";
import { isComposerSlashCommandAllowedDuringTask, type ComposerSlashCapabilitySnapshot } from "../model/composerSlashCommandCatalog";

export function pushBanner(
  dispatch: Dispatch<AppAction>,
  level: NoticeLevel,
  title: string,
  detail: string | null,
): void {
  dispatch({ type: "banner/pushed", banner: { id: `slash:${title}:${detail ?? ""}`, level, title, detail, source: "slash-command" } });
}

export function pushThreadNotice(
  dispatch: Dispatch<AppAction>,
  threadId: string,
  title: string,
  detail: string | null,
  level: NoticeLevel,
  source: string,
): void {
  dispatch({ type: "conversation/systemNoticeAdded", conversationId: threadId, turnId: null, title, detail, level, source });
}

export function mapAccountSummary(response: GetAccountResponse): AccountSummary | null {
  if (response.account === null) return null;
  return response.account.type === "apiKey"
    ? { authMode: "apikey", planType: null }
    : { authMode: "chatgpt", planType: response.account.planType };
}

export function isRealtimeActive(state: RealtimeState | null): boolean {
  return state !== null && state.sessionId !== null && !state.closed;
}

export function parseSandboxMode(argumentsText: string): "elevated" | "unelevated" {
  const normalized = argumentsText.trim().toLowerCase();
  return normalized.includes("elevated") || normalized.includes("enhanced") ? "elevated" : "unelevated";
}

export function assertCommandAvailable(
  commandId: string,
  taskRunning: boolean,
  capabilities?: ComposerSlashCapabilitySnapshot,
): void {
  if (taskRunning && !isComposerSlashCommandAllowedDuringTask(commandId, capabilities)) {
    throw new Error("当前有任务正在执行，官方不允许这条命令在运行中使用。");
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
