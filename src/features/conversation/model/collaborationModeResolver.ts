import type { CollaborationMode } from "../../../protocol/generated/CollaborationMode";
import type { CollaborationModePreset, CollaborationPreset } from "../../../domain/timeline";
import type { ComposerSelection } from "../../composer/model/composerPreferences";

function findPreset(
  modes: ReadonlyArray<CollaborationModePreset>,
  presetMode: CollaborationPreset,
): CollaborationModePreset | null {
  return modes.find((mode) => mode.mode === presetMode) ?? null;
}

export function resolveCollaborationModePreset(
  modes: ReadonlyArray<CollaborationModePreset>,
  presetMode: CollaborationPreset,
  selection: ComposerSelection,
): CollaborationMode {
  const preset = findPreset(modes, presetMode);
  if (preset === null) {
    throw new Error(`Current app-server did not expose the ${presetMode} collaboration preset.`);
  }
  return {
    mode: presetMode,
    settings: {
      model: preset.model ?? selection.model ?? "",
      reasoning_effort: preset.reasoningEffort ?? selection.effort ?? null,
      developer_instructions: null,
    },
  };
}
