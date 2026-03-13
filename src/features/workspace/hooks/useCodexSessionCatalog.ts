import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentEnvironment, HostBridge } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import { mapCodexSessionsToThreads } from "../model/threadCatalog";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface CodexSessionCatalogController {
  readonly sessions: ReadonlyArray<ThreadSummary>;
  readonly loading: boolean;
  readonly error: string | null;
  reload: () => Promise<void>;
}

export function useCodexSessionCatalog(hostBridge: HostBridge, agentEnvironment: AgentEnvironment): CodexSessionCatalogController {
  const [sessions, setSessions] = useState<ReadonlyArray<ThreadSummary>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextSessions = mapCodexSessionsToThreads(await hostBridge.app.listCodexSessions({ agentEnvironment }));
      setSessions(nextSessions);
      setError(null);
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [agentEnvironment, hostBridge.app]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(
    () => ({ sessions, loading, error, reload }),
    [error, loading, reload, sessions]
  );
}
