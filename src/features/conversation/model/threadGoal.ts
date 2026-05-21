import type { ThreadGoal } from "../../../protocol/generated/v2/ThreadGoal";
import type { ThreadGoalStatus } from "../../../protocol/generated/v2/ThreadGoalStatus";

export type ThreadGoalDisplayStatus = ThreadGoalStatus | "blocked" | "usageLimited";

export type ThreadGoalSlashCommand =
  | { readonly type: "show" }
  | { readonly type: "edit" }
  | { readonly type: "clear" }
  | { readonly type: "setStatus"; readonly status: "active" | "paused" }
  | { readonly type: "setObjective"; readonly objective: string };

export function parseThreadGoalSlashCommand(text: string): ThreadGoalSlashCommand | null {
  const trimmed = text.trim();
  const match = /^\/goal(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (match === null) {
    return null;
  }
  const argumentsText = (match[1] ?? "").trim();
  if (argumentsText.length === 0) {
    return { type: "show" };
  }
  const control = parseThreadGoalControl(argumentsText);
  if (control !== null) {
    return control;
  }
  return { type: "setObjective", objective: argumentsText };
}

export function parseThreadGoalControl(argumentsText: string): Exclude<ThreadGoalSlashCommand, { readonly type: "show" } | { readonly type: "setObjective"; readonly objective: string }> | null {
  const normalized = argumentsText.trim().toLowerCase();
  if (normalized === "edit") return { type: "edit" };
  if (normalized === "clear") return { type: "clear" };
  if (normalized === "pause") return { type: "setStatus", status: "paused" };
  if (normalized === "resume" || normalized === "unpause") return { type: "setStatus", status: "active" };
  return null;
}

export function formatThreadGoalTitle(goal: Pick<ThreadGoal, "status">): string {
  const status = goal.status as ThreadGoalDisplayStatus;
  if (status === "active") return "正在执行的目标";
  if (status === "paused") return "已暂停的目标";
  if (status === "blocked") return "已阻塞的目标";
  if (status === "usageLimited") return "受用量限制的目标";
  if (status === "budgetLimited") return "预算受限的目标";
  return "已完成的目标";
}

export function formatThreadGoalStatus(status: ThreadGoalDisplayStatus): string {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "blocked") return "blocked";
  if (status === "usageLimited") return "usage limited";
  if (status === "budgetLimited") return "limited by budget";
  return "complete";
}

export function formatThreadGoalElapsedSeconds(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  if (wholeSeconds < 60) {
    return `${wholeSeconds}s`;
  }
  const totalMinutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${remainingSeconds}s`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return `${totalHours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return `${days}d ${remainingHours}h ${remainingMinutes}m`;
}

export function resolveEditedThreadGoalStatus(goal: Pick<ThreadGoal, "status">): "active" | "paused" {
  return goal.status === "paused" ? "paused" : "active";
}

export function resolveToggledThreadGoalStatus(goal: Pick<ThreadGoal, "status">): "active" | "paused" {
  return goal.status === "active" ? "paused" : "active";
}

export function formatThreadGoalCommandHint(status: ThreadGoalDisplayStatus): string {
  if (status === "active") return "可用命令：/goal edit, /goal pause, /goal clear";
  if (status === "paused" || status === "blocked" || status === "usageLimited") {
    return "可用命令：/goal edit, /goal resume, /goal clear";
  }
  return "可用命令：/goal edit, /goal clear";
}
