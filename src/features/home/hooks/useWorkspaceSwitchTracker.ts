import { useEffect, useRef } from "react";
import type { AppState, WorkspaceSwitchState } from "../../../domain/types";
import { useAppDispatch, useAppSelector } from "../../../state/store";

const SLOW_WORKSPACE_SWITCH_MS = 1_000;

interface UseWorkspaceSwitchTrackerOptions {
  readonly selectedRootId: string | null;
  readonly selectedRootPath: string | null;
  readonly gitError: string | null;
  readonly gitLoading: boolean;
  readonly gitStatusLoaded: boolean;
}

function selectWorkspaceSwitch(state: AppState): WorkspaceSwitchState {
  return state.workspaceSwitch;
}

function isWorkspaceSwitchEqual(
  left: WorkspaceSwitchState,
  right: WorkspaceSwitchState,
): boolean {
  return left.switchId === right.switchId
    && left.rootId === right.rootId
    && left.rootPath === right.rootPath
    && left.phase === right.phase
    && left.startedAt === right.startedAt
    && left.completedAt === right.completedAt
    && left.durationMs === right.durationMs
    && left.error === right.error;
}

function logWorkspaceSwitchStart(
  switchId: number,
  rootId: string,
  rootPath: string,
): void {
  console.info("workspace_switch_started", { switchId, rootId, rootPath });
}

function logWorkspaceSwitchOutcome(state: WorkspaceSwitchState): void {
  const eventName = state.phase === "failed"
    ? "workspace_switch_failed"
    : "workspace_switch_completed";
  const payload = {
    switchId: state.switchId,
    rootId: state.rootId,
    rootPath: state.rootPath,
    durationMs: state.durationMs,
    error: state.error,
  };
  if (state.phase === "failed") {
    console.error(eventName, payload);
    return;
  }
  if ((state.durationMs ?? 0) >= SLOW_WORKSPACE_SWITCH_MS) {
    console.warn("workspace_switch_slow", payload);
  }
  console.info(eventName, payload);
}

function hasWorkspaceSwitchSettled(
  options: UseWorkspaceSwitchTrackerOptions,
  hasObservedGitReset: boolean,
): boolean {
  if (!hasObservedGitReset) {
    return false;
  }
  if (options.gitLoading) {
    return false;
  }
  return options.gitStatusLoaded || options.gitError !== null;
}

function shouldObserveGitReset(
  options: UseWorkspaceSwitchTrackerOptions,
): boolean {
  return options.gitLoading || (!options.gitStatusLoaded && options.gitError === null);
}

export function useWorkspaceSwitchTracker(
  options: UseWorkspaceSwitchTrackerOptions,
): WorkspaceSwitchState {
  const dispatch = useAppDispatch();
  const workspaceSwitch = useAppSelector(selectWorkspaceSwitch, isWorkspaceSwitchEqual);
  const activeSwitchIdRef = useRef(0);
  const hasObservedGitResetRef = useRef(false);
  const lastLoggedOutcomeIdRef = useRef(0);

  useEffect(() => {
    if (options.selectedRootId === null || options.selectedRootPath === null) {
      activeSwitchIdRef.current += 1;
      hasObservedGitResetRef.current = false;
      dispatch({ type: "workspaceSwitch/cleared" });
      return;
    }

    const switchId = activeSwitchIdRef.current + 1;
    activeSwitchIdRef.current = switchId;
    hasObservedGitResetRef.current = false;
    dispatch({
      type: "workspaceSwitch/started",
      switchId,
      rootId: options.selectedRootId,
      rootPath: options.selectedRootPath,
      startedAt: Date.now(),
    });
    logWorkspaceSwitchStart(switchId, options.selectedRootId, options.selectedRootPath);
  }, [dispatch, options.selectedRootId, options.selectedRootPath]);

  useEffect(() => {
    if (workspaceSwitch.phase !== "switching") {
      return;
    }
    if (workspaceSwitch.switchId !== activeSwitchIdRef.current) {
      return;
    }

    if (!hasObservedGitResetRef.current && shouldObserveGitReset(options)) {
      hasObservedGitResetRef.current = true;
    }
    if (!hasWorkspaceSwitchSettled(options, hasObservedGitResetRef.current)) {
      return;
    }

    const completedAt = Date.now();
    const durationMs = Math.max(0, completedAt - (workspaceSwitch.startedAt ?? completedAt));
    if (options.gitError !== null) {
      dispatch({
        type: "workspaceSwitch/failed",
        switchId: workspaceSwitch.switchId,
        completedAt,
        durationMs,
        error: options.gitError,
      });
      return;
    }
    dispatch({
      type: "workspaceSwitch/completed",
      switchId: workspaceSwitch.switchId,
      completedAt,
      durationMs,
    });
  }, [dispatch, options, workspaceSwitch]);

  useEffect(() => {
    if ((workspaceSwitch.phase !== "ready" && workspaceSwitch.phase !== "failed")
      || workspaceSwitch.switchId === 0
      || workspaceSwitch.switchId === lastLoggedOutcomeIdRef.current) {
      return;
    }
    lastLoggedOutcomeIdRef.current = workspaceSwitch.switchId;
    logWorkspaceSwitchOutcome(workspaceSwitch);
  }, [workspaceSwitch]);

  return workspaceSwitch;
}
