import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

const STORAGE_KEY_WIDTH = "codex-app-plus.appSidebar.width";

const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 220;
const MAX_WIDTH_ABSOLUTE = 560;
const MAX_WIDTH_RATIO = 0.45;

interface ResizeSession {
  readonly startX: number;
  readonly startWidth: number;
  readonly maxWidth: number;
}

export interface AppSidebarLayoutState {
  readonly width: number;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly isResizing: boolean;
  readonly setWidth: (value: number) => void;
  readonly resetWidth: () => void;
  readonly startResize: (event: ReactMouseEvent) => void;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function readStoredWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_WIDTH;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY_WIDTH);
  if (raw === null) {
    return DEFAULT_WIDTH;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WIDTH;
  }
  return parsed;
}

function resolveMaxWidth(containerWidth: number | null): number {
  if (containerWidth === null || containerWidth <= 0) {
    return MAX_WIDTH_ABSOLUTE;
  }
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH_ABSOLUTE, Math.floor(containerWidth * MAX_WIDTH_RATIO)));
}

export function useAppSidebarLayout(): AppSidebarLayoutState {
  const [width, setWidthState] = useState<number>(() => readStoredWidth());
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const update = () => setContainerWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const maxWidth = resolveMaxWidth(containerWidth);

  useEffect(() => {
    setWidthState((current) => clamp(current, MIN_WIDTH, maxWidth));
  }, [maxWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
  }, [width]);

  const setWidth = useCallback((value: number) => {
    setWidthState((current) => {
      const next = clamp(value, MIN_WIDTH, maxWidth);
      return next === current ? current : next;
    });
  }, [maxWidth]);

  const resetWidth = useCallback(() => {
    setWidthState(clamp(DEFAULT_WIDTH, MIN_WIDTH, maxWidth));
  }, [maxWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const session = resizeSessionRef.current;
      if (session === null) {
        return;
      }
      event.preventDefault();
      setWidthState(clamp(session.startWidth + event.clientX - session.startX, MIN_WIDTH, session.maxWidth));
    }

    function handleMouseUp() {
      resizeSessionRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const startResize = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    resizeSessionRef.current = {
      startX: event.clientX,
      startWidth: width,
      maxWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizing(true);
  }, [maxWidth, width]);

  return {
    width,
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth,
    isResizing,
    setWidth,
    resetWidth,
    startResize,
  };
}
