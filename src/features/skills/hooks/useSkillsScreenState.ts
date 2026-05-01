import type { AppState } from "../../../domain/types";
import { useAppSelector } from "../../../state/store";

export interface SkillsScreenState {
  readonly authMode: AppState["authMode"];
  readonly authStatus: AppState["authStatus"];
  readonly configSnapshot: AppState["configSnapshot"];
  readonly initialized: boolean;
  readonly mcpServerStatuses: AppState["mcpServerStatuses"];
  readonly notifications: AppState["notifications"];
}

function selectSkillsScreenState(state: AppState): SkillsScreenState {
  return {
    authMode: state.authMode,
    authStatus: state.authStatus,
    configSnapshot: state.configSnapshot,
    initialized: state.initialized,
    mcpServerStatuses: state.mcpServerStatuses,
    notifications: state.notifications,
  };
}

function isSkillsScreenStateEqual(left: SkillsScreenState, right: SkillsScreenState): boolean {
  return left.authMode === right.authMode
    && left.authStatus === right.authStatus
    && Object.is(left.configSnapshot, right.configSnapshot)
    && left.initialized === right.initialized
    && Object.is(left.mcpServerStatuses, right.mcpServerStatuses)
    && Object.is(left.notifications, right.notifications);
}

export function useSkillsScreenState(): SkillsScreenState {
  return useAppSelector(selectSkillsScreenState, isSkillsScreenStateEqual);
}
