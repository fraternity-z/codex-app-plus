import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";
import type { PatchApplyStatus } from "../../../protocol/generated/v2/PatchApplyStatus";

const SINGLE_FILE_COUNT = 1;

function formatPrimaryFileLabel(verb: string, changes: ReadonlyArray<FileUpdateChange>): string | null {
  const primaryPath = changes[0]?.path.trim() ?? "";
  if (primaryPath.length === 0) {
    return null;
  }
  if (changes.length === SINGLE_FILE_COUNT) {
    return `${verb} ${primaryPath}`;
  }
  return `${verb} ${primaryPath} 等 ${changes.length} 个文件`;
}

function formatCompletedSummary(changes: ReadonlyArray<FileUpdateChange>): string {
  return formatPrimaryFileLabel("已编辑", changes) ?? `已编辑 ${changes.length} 个文件`;
}

function formatInProgressSummary(changes: ReadonlyArray<FileUpdateChange>): string {
  return formatPrimaryFileLabel("正在编辑", changes) ?? "正在编辑文件";
}

export function formatFileChangeSummary(status: PatchApplyStatus, changes: ReadonlyArray<FileUpdateChange>): string {
  if (status === "completed") {
    return formatCompletedSummary(changes);
  }
  if (status === "failed") {
    return "文件编辑失败";
  }
  if (status === "declined") {
    return "文件编辑已拒绝";
  }
  return formatInProgressSummary(changes);
}
