import { useCallback, useEffect, useState } from "react";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import { readStoredJson, writeStoredJson } from "../../shared/utils/storageJson";
import {
  createAutomationRecord,
  parseAutomationRecords,
  recordAutomationRunResult as applyAutomationRunResult,
  updateAutomationRecord,
  type AutomationDraft,
  type AutomationRecord,
} from "../model/automations";

const AUTOMATIONS_STORAGE_KEY = "codex-app-plus.automations.v1";

export interface AutomationsController {
  readonly automations: ReadonlyArray<AutomationRecord>;
  readonly createAutomation: (draft: AutomationDraft, root: WorkspaceRoot) => AutomationRecord;
  readonly updateAutomation: (automationId: string, draft: AutomationDraft, root: WorkspaceRoot) => void;
  readonly deleteAutomation: (automationId: string) => void;
  readonly setAutomationEnabled: (automationId: string, enabled: boolean) => void;
  readonly recordAutomationRunResult: (
    automationId: string,
    result: { readonly runAt: Date; readonly error: string | null },
  ) => void;
}

export function useAutomations(): AutomationsController {
  const [automations, setAutomations] = useState<ReadonlyArray<AutomationRecord>>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    return readStoredJson(AUTOMATIONS_STORAGE_KEY, parseAutomationRecords, []);
  });

  useEffect(() => {
    writeStoredJson(AUTOMATIONS_STORAGE_KEY, automations);
  }, [automations]);

  const createAutomation = useCallback((draft: AutomationDraft, root: WorkspaceRoot) => {
    const record = createAutomationRecord(draft, root);
    setAutomations((current) => [record, ...current]);
    return record;
  }, []);

  const updateAutomation = useCallback((automationId: string, draft: AutomationDraft, root: WorkspaceRoot) => {
    setAutomations((current) => current.map((automation) => (
      automation.id === automationId ? updateAutomationRecord(automation, draft, root) : automation
    )));
  }, []);

  const deleteAutomation = useCallback((automationId: string) => {
    setAutomations((current) => current.filter((automation) => automation.id !== automationId));
  }, []);

  const setAutomationEnabled = useCallback((automationId: string, enabled: boolean) => {
    setAutomations((current) => current.map((automation) => (
      automation.id === automationId
        ? { ...automation, enabled, updatedAt: new Date().toISOString(), lastError: enabled ? null : automation.lastError }
        : automation
    )));
  }, []);

  const recordAutomationRunResult = useCallback((
    automationId: string,
    result: { readonly runAt: Date; readonly error: string | null },
  ) => {
    setAutomations((current) => current.map((automation) => (
      automation.id === automationId ? applyAutomationRunResult(automation, result) : automation
    )));
  }, []);

  return {
    automations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    setAutomationEnabled,
    recordAutomationRunResult,
  };
}
