import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReasoningEffort } from "../../../protocol/generated/ReasoningEffort";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import {
  type ComposerSelection,
  type ComposerModelOption,
  findComposerModel,
  resolveConfiguredComposerSelection
} from "../model/composerPreferences";

interface ComposerSelectionState {
  readonly selectedModel: string | null;
  readonly selectedEffort: ReasoningEffort | null;
  readonly selectedServiceTier: ServiceTier | null;
  readonly selectedModelOption: ComposerModelOption | null;
  readonly selectModel: (model: string) => void;
  readonly selectEffort: (effort: ReasoningEffort) => void;
  readonly selectServiceTier: (serviceTier: ServiceTier | null) => void;
  readonly replaceSelection: (selection: ComposerSelection) => void;
}

export function useComposerSelection(
  models: ReadonlyArray<ComposerModelOption>,
  defaultModel: string | null,
  defaultEffort: ReasoningEffort | null,
  defaultServiceTier: ServiceTier | null = null
): ComposerSelectionState {
  const persistedSelection = useMemo(
    () => resolveConfiguredComposerSelection(models, defaultModel, defaultEffort, defaultServiceTier),
    [defaultEffort, defaultModel, defaultServiceTier, models]
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(persistedSelection.model);
  const [selectedEffort, setSelectedEffort] = useState<ReasoningEffort | null>(persistedSelection.effort);
  const [selectedServiceTier, setSelectedServiceTier] = useState<ServiceTier | null>(persistedSelection.serviceTier);
  const previousPersistedSelectionRef = useRef<ComposerSelection>(persistedSelection);
  const selectedModelOption = useMemo(() => findComposerModel(models, selectedModel), [models, selectedModel]);

  useEffect(() => {
    const previous = previousPersistedSelectionRef.current;
    if (
      previous.model === persistedSelection.model
      && previous.effort === persistedSelection.effort
      && previous.serviceTier === persistedSelection.serviceTier
    ) {
      return;
    }

    previousPersistedSelectionRef.current = persistedSelection;
    setSelectedModel(persistedSelection.model);
    setSelectedEffort(persistedSelection.effort);
    setSelectedServiceTier(persistedSelection.serviceTier);
  }, [persistedSelection]);

  const replaceSelection = useCallback((selection: ComposerSelection) => {
    setSelectedModel(selection.model);
    setSelectedEffort(selection.effort);
    setSelectedServiceTier(selection.serviceTier);
  }, []);

  return {
    selectedModel,
    selectedEffort,
    selectedServiceTier,
    selectedModelOption,
    selectModel: setSelectedModel,
    selectEffort: setSelectedEffort,
    selectServiceTier: setSelectedServiceTier,
    replaceSelection
  };
}
