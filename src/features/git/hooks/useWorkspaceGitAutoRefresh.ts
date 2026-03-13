import { useCallback, useEffect, useRef } from "react";

const AUTO_REFRESH_DEBOUNCE_MS = 120;
const WINDOW_FOCUS_EVENT = "focus";
const DOCUMENT_VISIBILITY_EVENT = "visibilitychange";

interface UseWorkspaceGitAutoRefreshOptions {
  readonly enabled: boolean;
  readonly selectedRootPath: string | null;
  readonly loading: boolean;
  readonly pendingAction: string | null;
  readonly refresh: () => Promise<void>;
}

export function useWorkspaceGitAutoRefresh(options: UseWorkspaceGitAutoRefreshOptions): void {
  const timerRef = useRef<number | null>(null);
  const previousEnabledRef = useRef(false);
  const loadingRef = useRef(options.loading);
  const pendingActionRef = useRef(options.pendingAction);
  const refreshRef = useRef(options.refresh);

  useEffect(() => {
    loadingRef.current = options.loading;
    pendingActionRef.current = options.pendingAction;
    refreshRef.current = options.refresh;
  }, [options.loading, options.pendingAction, options.refresh]);

  const cancelScheduledRefresh = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const queueRefresh = useCallback(() => {
    if (!options.enabled || options.selectedRootPath === null) {
      return;
    }
    cancelScheduledRefresh();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!loadingRef.current && pendingActionRef.current === null) {
        void refreshRef.current();
      }
    }, AUTO_REFRESH_DEBOUNCE_MS);
  }, [cancelScheduledRefresh, options.enabled, options.selectedRootPath]);

  useEffect(() => cancelScheduledRefresh, [cancelScheduledRefresh]);

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current;
    previousEnabledRef.current = options.enabled;
    if (!wasEnabled && options.enabled && options.selectedRootPath !== null) {
      queueRefresh();
    }
    if (!options.enabled) {
      cancelScheduledRefresh();
    }
  }, [cancelScheduledRefresh, options.enabled, options.selectedRootPath, queueRefresh]);

  useEffect(() => {
    if (!options.enabled || options.selectedRootPath === null) {
      return;
    }

    const handleFocus = () => queueRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queueRefresh();
      }
    };

    window.addEventListener(WINDOW_FOCUS_EVENT, handleFocus);
    document.addEventListener(DOCUMENT_VISIBILITY_EVENT, handleVisibilityChange);
    return () => {
      window.removeEventListener(WINDOW_FOCUS_EVENT, handleFocus);
      document.removeEventListener(DOCUMENT_VISIBILITY_EVENT, handleVisibilityChange);
    };
  }, [options.enabled, options.selectedRootPath, queueRefresh]);
}
