import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { APP_VERSION } from "../../../app/appVersion";

export const APP_UPDATE_UNSUPPORTED_MESSAGE = "自动更新在当前运行模式下不可用。";

export interface AppUpdateProgress {
  readonly downloadedBytes: number;
  readonly totalBytes: number | null;
  readonly progressPercent: number | null;
}

function toProgressPercent(downloadedBytes: number, totalBytes: number | null): number | null {
  if (totalBytes === null || totalBytes <= 0) {
    return null;
  }
  return Math.min(downloadedBytes / totalBytes, 1);
}

function ensureUpdaterAvailable(): void {
  if (!supportsAppUpdate()) {
    throw new Error(APP_UPDATE_UNSUPPORTED_MESSAGE);
  }
}

export function supportsAppUpdate(): boolean {
  return isTauri() && import.meta.env.PROD;
}

export async function readCurrentAppVersion(): Promise<string> {
  return supportsAppUpdate() ? getVersion() : APP_VERSION;
}

export async function releasePendingAppUpdate(update: Update | null): Promise<void> {
  if (update !== null) {
    await update.close();
  }
}

export async function checkForAvailableAppUpdate(currentUpdate: Update | null): Promise<Update | null> {
  ensureUpdaterAvailable();
  const nextUpdate = await check();
  if (currentUpdate !== null && currentUpdate !== nextUpdate) {
    await currentUpdate.close();
  }
  return nextUpdate;
}

export async function downloadPendingAppUpdate(
  update: Update,
  onProgress: (progress: AppUpdateProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;
  await update.download((event) => {
    if (event.event === "Started") {
      totalBytes = event.data.contentLength ?? null;
      onProgress({ downloadedBytes, totalBytes, progressPercent: toProgressPercent(0, totalBytes) ?? 0 });
      return;
    }
    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      onProgress({ downloadedBytes, totalBytes, progressPercent: toProgressPercent(downloadedBytes, totalBytes) });
    }
  });
}

export async function installPendingAppUpdate(update: Update): Promise<void> {
  ensureUpdaterAvailable();
  await update.install();
  await relaunch();
}
