import type { AppState } from "../../domain/types";
import { useAppSelector } from "../../state/store";

export interface AppBootstrapState {
  readonly authLoginPending: boolean;
  readonly authStatus: AppState["authStatus"];
  readonly bootstrapBusy: boolean;
  readonly fatalError: AppState["fatalError"];
  readonly initialized: boolean;
}

interface AppControllerRuntimeState {
  readonly configSnapshot: AppState["configSnapshot"];
  readonly connectionStatus: AppState["connectionStatus"];
  readonly pendingRequestsById: AppState["pendingRequestsById"];
  readonly selectedConversationId: AppState["selectedConversationId"];
  readonly windowsSandboxSetup: AppState["windowsSandboxSetup"];
}

function selectAppBootstrapState(state: AppState): AppBootstrapState {
  return {
    authLoginPending: state.authLogin.pending,
    authStatus: state.authStatus,
    bootstrapBusy: state.bootstrapBusy,
    fatalError: state.fatalError,
    initialized: state.initialized,
  };
}

function isAppBootstrapStateEqual(left: AppBootstrapState, right: AppBootstrapState): boolean {
  return left.authLoginPending === right.authLoginPending
    && left.authStatus === right.authStatus
    && left.bootstrapBusy === right.bootstrapBusy
    && left.fatalError === right.fatalError
    && left.initialized === right.initialized;
}

function selectAppControllerRuntimeState(state: AppState): AppControllerRuntimeState {
  return {
    configSnapshot: state.configSnapshot,
    connectionStatus: state.connectionStatus,
    pendingRequestsById: state.pendingRequestsById,
    selectedConversationId: state.selectedConversationId,
    windowsSandboxSetup: state.windowsSandboxSetup,
  };
}

function isAppControllerRuntimeStateEqual(left: AppControllerRuntimeState, right: AppControllerRuntimeState): boolean {
  return Object.is(left.configSnapshot, right.configSnapshot)
    && left.connectionStatus === right.connectionStatus
    && Object.is(left.pendingRequestsById, right.pendingRequestsById)
    && left.selectedConversationId === right.selectedConversationId
    && Object.is(left.windowsSandboxSetup, right.windowsSandboxSetup);
}

export function useAppBootstrapState(): AppBootstrapState {
  return useAppSelector(selectAppBootstrapState, isAppBootstrapStateEqual);
}

export function useAppControllerRuntimeState(): AppControllerRuntimeState {
  return useAppSelector(selectAppControllerRuntimeState, isAppControllerRuntimeStateEqual);
}
