import { useCallback, useEffect, useRef } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  checkForAvailableAppUpdate,
  downloadPendingAppUpdate,
  installPendingAppUpdate,
  readCurrentAppVersion,
  releasePendingAppUpdate,
  supportsAppUpdate,
} from "../../features/settings";
import { useAppDispatch } from "../../state/store";
import { toErrorMessage } from "./appControllerTypes";

const NO_PENDING_UPDATE_ERROR = "当前没有可安装的更新。";

interface AppUpdaterActions {
  checkForAppUpdate: () => Promise<void>;
  installAppUpdate: () => Promise<void>;
}

function createCheckedAt(): string {
  return new Date().toISOString();
}

async function downloadAvailableUpdate(
  update: Update,
  dispatch: ReturnType<typeof useAppDispatch>,
): Promise<void> {
  dispatch({ type: "appUpdate/downloadStarted" });
  await downloadPendingAppUpdate(update, (progress) => {
    dispatch({ type: "appUpdate/downloadProgress", ...progress });
  });
  dispatch({ type: "appUpdate/downloaded" });
}

export function useAppUpdater(): AppUpdaterActions {
  const dispatch = useAppDispatch();
  const pendingUpdateRef = useRef<Update | null>(null);
  const checkInFlightRef = useRef(false);
  const installInFlightRef = useRef(false);
  const autoCheckStartedRef = useRef(false);

  const reportUpdateError = useCallback((error: unknown) => {
    dispatch({ type: "appUpdate/error", message: toErrorMessage(error) });
  }, [dispatch]);

  const checkForAppUpdate = useCallback(async () => {
    if (checkInFlightRef.current || installInFlightRef.current) {
      return;
    }
    checkInFlightRef.current = true;
    dispatch({ type: "appUpdate/checkStarted" });
    try {
      const checkedAt = createCheckedAt();
      const update = await checkForAvailableAppUpdate(pendingUpdateRef.current);
      pendingUpdateRef.current = update;
      if (update === null) {
        dispatch({ type: "appUpdate/upToDate", checkedAt });
        return;
      }
      dispatch({
        type: "appUpdate/available",
        currentVersion: update.currentVersion,
        nextVersion: update.version,
        notes: update.body ?? null,
        checkedAt,
      });
      await downloadAvailableUpdate(update, dispatch);
    } catch (error) {
      reportUpdateError(error);
      throw error;
    } finally {
      checkInFlightRef.current = false;
    }
  }, [dispatch, reportUpdateError]);

  const installAppUpdate = useCallback(async () => {
    if (checkInFlightRef.current || installInFlightRef.current) {
      return;
    }
    const pendingUpdate = pendingUpdateRef.current;
    if (pendingUpdate === null) {
      const error = new Error(NO_PENDING_UPDATE_ERROR);
      reportUpdateError(error);
      throw error;
    }
    installInFlightRef.current = true;
    dispatch({ type: "appUpdate/installStarted" });
    try {
      await installPendingAppUpdate(pendingUpdate);
    } catch (error) {
      reportUpdateError(error);
      throw error;
    } finally {
      installInFlightRef.current = false;
    }
  }, [dispatch, reportUpdateError]);

  useEffect(() => {
    void readCurrentAppVersion()
      .then((version) => {
        dispatch({ type: "appUpdate/currentVersionLoaded", version });
      })
      .catch(reportUpdateError);
  }, [dispatch, reportUpdateError]);

  useEffect(() => {
    if (autoCheckStartedRef.current || !supportsAppUpdate() || import.meta.env.DEV) {
      return;
    }
    autoCheckStartedRef.current = true;
    void checkForAppUpdate().catch((error) => {
      console.error("自动检查更新失败", error);
    });
  }, [checkForAppUpdate]);

  useEffect(() => () => {
    void releasePendingAppUpdate(pendingUpdateRef.current);
    pendingUpdateRef.current = null;
  }, []);

  return { checkForAppUpdate, installAppUpdate };
}
