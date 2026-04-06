import type { AppState } from "../../domain/types";
import { useAppSelector } from "../../state/store";

export interface AppBootstrapState {
  readonly authLoginPending: boolean;
  readonly authStatus: AppState["authStatus"];
  readonly bootstrapBusy: boolean;
  readonly fatalError: AppState["fatalError"];
  readonly initialized: boolean;
}

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

export interface SettingsScreenState {
  readonly appUpdate: AppState["appUpdate"];
  readonly bootstrapBusy: boolean;
  readonly configSnapshot: AppState["configSnapshot"];
  readonly experimentalFeatures: AppState["experimentalFeatures"];
  readonly initialized: boolean;
}

export interface SkillsScreenState {
  readonly authMode: AppState["authMode"];
  readonly authStatus: AppState["authStatus"];
  readonly initialized: boolean;
  readonly notifications: AppState["notifications"];
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

function selectSettingsScreenState(state: AppState): SettingsScreenState {
  return {
    appUpdate: state.appUpdate,
    bootstrapBusy: state.bootstrapBusy,
    configSnapshot: state.configSnapshot,
    experimentalFeatures: state.experimentalFeatures,
    initialized: state.initialized,
  };
}

function isSettingsScreenStateEqual(left: SettingsScreenState, right: SettingsScreenState): boolean {
  return Object.is(left.appUpdate, right.appUpdate)
    && left.bootstrapBusy === right.bootstrapBusy
    && Object.is(left.configSnapshot, right.configSnapshot)
    && Object.is(left.experimentalFeatures, right.experimentalFeatures)
    && left.initialized === right.initialized;
}

function selectSkillsScreenState(state: AppState): SkillsScreenState {
  return {
    authMode: state.authMode,
    authStatus: state.authStatus,
    initialized: state.initialized,
    notifications: state.notifications,
  };
}

function isSkillsScreenStateEqual(left: SkillsScreenState, right: SkillsScreenState): boolean {
  return left.authMode === right.authMode
    && left.authStatus === right.authStatus
    && left.initialized === right.initialized
    && Object.is(left.notifications, right.notifications);
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

export function useHomeScreenState(): HomeScreenState {
  return useAppSelector(selectHomeScreenState, isHomeScreenStateEqual);
}

export function useSettingsScreenState(): SettingsScreenState {
  return useAppSelector(selectSettingsScreenState, isSettingsScreenStateEqual);
}

export function useSkillsScreenState(): SkillsScreenState {
  return useAppSelector(selectSkillsScreenState, isSkillsScreenStateEqual);
}

export function useAppControllerRuntimeState(): AppControllerRuntimeState {
  return useAppSelector(selectAppControllerRuntimeState, isAppControllerRuntimeStateEqual);
}
