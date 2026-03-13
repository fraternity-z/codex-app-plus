import { useEffect, useMemo, useState } from "react";
import type { HostBridge } from "../../../bridge/types";
import type { ReasoningEffort } from "../../../protocol/generated/ReasoningEffort";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import {
  type ComposerModelOption,
  listComposerModels,
  readComposerSelectionFromConfig
} from "../model/composerPreferences";

interface ComposerPickerState {
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ReasoningEffort | null;
  readonly defaultServiceTier: ServiceTier | null;
}

export function useComposerPicker(
  hostBridge: HostBridge,
  configSnapshot: unknown,
  ready: boolean
): ComposerPickerState {
  const [models, setModels] = useState<ReadonlyArray<ComposerModelOption>>([]);
  const defaults = useMemo(() => readComposerSelectionFromConfig(configSnapshot), [configSnapshot]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    const loadModels = async () => {
      try {
        const nextModels = await listComposerModels(hostBridge);
        if (!cancelled) {
          setModels(nextModels);
        }
      } catch (error) {
        console.error("读取模型列表失败", error);
      }
    };

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [hostBridge, ready]);

  return {
    models,
    defaultModel: defaults.model,
    defaultEffort: defaults.effort,
    defaultServiceTier: defaults.serviceTier
  };
}
