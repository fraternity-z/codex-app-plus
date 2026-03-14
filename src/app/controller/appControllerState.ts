import type { AppState } from "../../domain/types";
import { useAppSelector } from "../../state/store";

export interface AppShellState {
  readonly account: AppState["account"];
  readonly authLoginPending: boolean;
  readonly authMode: AppState["authMode"];
  readonly authStatus: AppState["authStatus"];
  readonly banners: AppState["banners"];
  readonly bootstrapBusy: boolean;
  readonly collaborationModes: AppState["collaborationModes"];
  readonly configSnapshot: AppState["configSnapshot"];
  readonly connectionStatus: AppState["connectionStatus"];
  readonly experimentalFeatures: AppState["experimentalFeatures"];
  readonly fatalError: AppState["fatalError"];
  readonly initialized: boolean;
  readonly inputText: AppState["inputText"];
  readonly rateLimits: AppState["rateLimits"];
  readonly retryScheduledAt: AppState["retryScheduledAt"];
  readonly windowsSandboxSetup: AppState["windowsSandboxSetup"];
}

interface AppControllerRuntimeState {
  readonly configSnapshot: AppState["configSnapshot"];
  readonly connectionStatus: AppState["connectionStatus"];
  readonly pendingRequestsById: AppState["pendingRequestsById"];
  readonly selectedConversationId: AppState["selectedConversationId"];
  readonly windowsSandboxSetup: AppState["windowsSandboxSetup"];
}

function selectAppShellState(state: AppState): AppShellState {
  return {
    account: state.account,
    authLoginPending: state.authLogin.pending,
    authMode: state.authMode,
    authStatus: state.authStatus,
    banners: state.banners,
    bootstrapBusy: state.bootstrapBusy,
    collaborationModes: state.collaborationModes,
    configSnapshot: state.configSnapshot,
    connectionStatus: state.connectionStatus,
    experimentalFeatures: state.experimentalFeatures,
    fatalError: state.fatalError,
    initialized: state.initialized,
    inputText: state.inputText,
    rateLimits: state.rateLimits,
    retryScheduledAt: state.retryScheduledAt,
    windowsSandboxSetup: state.windowsSandboxSetup,
  };
}

function isAppShellStateEqual(left: AppShellState, right: AppShellState): boolean {
  return Object.is(left.account, right.account)
    && left.authLoginPending === right.authLoginPending
    && left.authMode === right.authMode
    && left.authStatus === right.authStatus
    && Object.is(left.banners, right.banners)
    && left.bootstrapBusy === right.bootstrapBusy
    && Object.is(left.collaborationModes, right.collaborationModes)
    && Object.is(left.configSnapshot, right.configSnapshot)
    && left.connectionStatus === right.connectionStatus
    && Object.is(left.experimentalFeatures, right.experimentalFeatures)
    && left.fatalError === right.fatalError
    && left.initialized === right.initialized
    && left.inputText === right.inputText
    && Object.is(left.rateLimits, right.rateLimits)
    && left.retryScheduledAt === right.retryScheduledAt
    && Object.is(left.windowsSandboxSetup, right.windowsSandboxSetup);
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

export function useAppShellState(): AppShellState {
  return useAppSelector(selectAppShellState, isAppShellStateEqual);
}

export function useAppControllerRuntimeState(): AppControllerRuntimeState {
  return useAppSelector(selectAppControllerRuntimeState, isAppControllerRuntimeStateEqual);
}
