import type { AppState } from "../../../domain/types";
import { useAppSelector } from "../../../state/store";

export interface HomeScreenState {
  readonly account: AppState["account"];
  readonly authLoginPending: boolean;
  readonly authMode: AppState["authMode"];
  readonly authStatus: AppState["authStatus"];
  readonly bootstrapBusy: boolean;
  readonly collaborationModes: AppState["collaborationModes"];
  readonly configSnapshot: AppState["configSnapshot"];
  readonly connectionStatus: AppState["connectionStatus"];
  readonly experimentalFeatures: AppState["experimentalFeatures"];
  readonly fatalError: AppState["fatalError"];
  readonly initialized: boolean;
  readonly rateLimits: AppState["rateLimits"];
  readonly retryScheduledAt: AppState["retryScheduledAt"];
  readonly workspaceSwitch: AppState["workspaceSwitch"];
}

function selectHomeScreenState(state: AppState): HomeScreenState {
  return {
    account: state.account,
    authLoginPending: state.authLogin.pending,
    authMode: state.authMode,
    authStatus: state.authStatus,
    bootstrapBusy: state.bootstrapBusy,
    collaborationModes: state.collaborationModes,
    configSnapshot: state.configSnapshot,
    connectionStatus: state.connectionStatus,
    experimentalFeatures: state.experimentalFeatures,
    fatalError: state.fatalError,
    initialized: state.initialized,
    rateLimits: state.rateLimits,
    retryScheduledAt: state.retryScheduledAt,
    workspaceSwitch: state.workspaceSwitch,
  };
}

function isHomeScreenStateEqual(left: HomeScreenState, right: HomeScreenState): boolean {
  return Object.is(left.account, right.account)
    && left.authLoginPending === right.authLoginPending
    && left.authMode === right.authMode
    && left.authStatus === right.authStatus
    && left.bootstrapBusy === right.bootstrapBusy
    && Object.is(left.collaborationModes, right.collaborationModes)
    && Object.is(left.configSnapshot, right.configSnapshot)
    && left.connectionStatus === right.connectionStatus
    && Object.is(left.experimentalFeatures, right.experimentalFeatures)
    && left.fatalError === right.fatalError
    && left.initialized === right.initialized
    && Object.is(left.rateLimits, right.rateLimits)
    && left.retryScheduledAt === right.retryScheduledAt
    && Object.is(left.workspaceSwitch, right.workspaceSwitch);
}

export function useHomeScreenState(): HomeScreenState {
  return useAppSelector(selectHomeScreenState, isHomeScreenStateEqual);
}
