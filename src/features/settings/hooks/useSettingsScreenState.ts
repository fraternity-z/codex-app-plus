import type { AppState } from "../../../domain/types";
import { useAppSelector } from "../../../state/store";

export interface SettingsScreenState {
  readonly appUpdate: AppState["appUpdate"];
  readonly bootstrapBusy: boolean;
  readonly configSnapshot: AppState["configSnapshot"];
  readonly experimentalFeatures: AppState["experimentalFeatures"];
  readonly initialized: boolean;
  readonly selectedConversationId: AppState["selectedConversationId"];
}

function selectSettingsScreenState(state: AppState): SettingsScreenState {
  return {
    appUpdate: state.appUpdate,
    bootstrapBusy: state.bootstrapBusy,
    configSnapshot: state.configSnapshot,
    experimentalFeatures: state.experimentalFeatures,
    initialized: state.initialized,
    selectedConversationId: state.selectedConversationId,
  };
}

function isSettingsScreenStateEqual(left: SettingsScreenState, right: SettingsScreenState): boolean {
  return Object.is(left.appUpdate, right.appUpdate)
    && left.bootstrapBusy === right.bootstrapBusy
    && Object.is(left.configSnapshot, right.configSnapshot)
    && Object.is(left.experimentalFeatures, right.experimentalFeatures)
    && left.initialized === right.initialized
    && left.selectedConversationId === right.selectedConversationId;
}

export function useSettingsScreenState(): SettingsScreenState {
  return useAppSelector(selectSettingsScreenState, isSettingsScreenStateEqual);
}
