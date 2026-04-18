import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

export type DiffViewStyle = "split" | "unified";

const STORAGE_KEY_WIDTH = "codex-app-plus.diffSidebar.width";
const STORAGE_KEY_EXPANDED = "codex-app-plus.diffSidebar.expanded";
const STORAGE_KEY_STYLE = "codex-app-plus.diffSidebar.style";

const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 320;
const MAX_WIDTH_ABSOLUTE = 1200;
const MAX_WIDTH_RATIO = 0.5;

export interface DiffSidebarLayoutState {
  readonly width: number;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly expanded: boolean;
  readonly diffStyle: DiffViewStyle;
  readonly selectedDiffPath: string | null;
  readonly isResizing: boolean;
  readonly setWidth: (value: number) => void;
  readonly resetWidth: () => void;
  readonly setExpanded: (value: boolean) => void;
  readonly toggleExpanded: () => void;
  readonly setDiffStyle: (value: DiffViewStyle) => void;
  readonly toggleDiffStyle: () => void;
  readonly setSelectedDiffPath: (path: string | null) => void;
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

function readStoredExpanded(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY_EXPANDED) === "1";
}

function readStoredStyle(): DiffViewStyle {
  if (typeof window === "undefined") {
    return "unified";
  }
  const raw = window.localStorage.getItem(STORAGE_KEY_STYLE);
  return raw === "split" ? "split" : "unified";
}

function resolveMaxWidth(containerWidth: number | null): number {
  if (containerWidth === null || containerWidth <= 0) {
    return MAX_WIDTH_ABSOLUTE;
  }
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH_ABSOLUTE, Math.floor(containerWidth * MAX_WIDTH_RATIO)));
}

interface ResizeSession {
  readonly startX: number;
  readonly startWidth: number;
  readonly maxWidth: number;
}

export function useDiffSidebarLayout(): DiffSidebarLayoutState {
  const [width, setWidthState] = useState<number>(() => readStoredWidth());
  const [expanded, setExpandedState] = useState<boolean>(() => readStoredExpanded());
  const [diffStyle, setDiffStyleState] = useState<DiffViewStyle>(() => readStoredStyle());
  const [selectedDiffPath, setSelectedDiffPathState] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const liveWidthRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_EXPANDED, expanded ? "1" : "0");
  }, [expanded]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_STYLE, diffStyle);
  }, [diffStyle]);

  const setWidth = useCallback((value: number) => {
    setWidthState((current) => {
      const next = clamp(value, MIN_WIDTH, maxWidth);
      return next === current ? current : next;
    });
  }, [maxWidth]);

  const resetWidth = useCallback(() => {
    setWidthState(clamp(DEFAULT_WIDTH, MIN_WIDTH, maxWidth));
  }, [maxWidth]);

  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpandedState((current) => !current);
  }, []);

  const setDiffStyle = useCallback((value: DiffViewStyle) => {
    setDiffStyleState(value);
  }, []);

  const toggleDiffStyle = useCallback(() => {
    setDiffStyleState((current) => (current === "split" ? "unified" : "split"));
  }, []);

  const setSelectedDiffPath = useCallback((path: string | null) => {
    setSelectedDiffPathState(path);
  }, []);

  useEffect(() => {
    if (!expanded) {
      resizeSessionRef.current = null;
      liveWidthRef.current = null;
    }
  }, [expanded]);

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
      const delta = event.clientX - session.startX;
      const next = clamp(session.startWidth - delta, MIN_WIDTH, session.maxWidth);
      liveWidthRef.current = next;
      setWidthState(next);
    }

    function handleMouseUp() {
      resizeSessionRef.current = null;
      liveWidthRef.current = null;
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
    if (expanded) {
      return;
    }
    event.preventDefault();
    resizeSessionRef.current = {
      startX: event.clientX,
      startWidth: width,
      maxWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizing(true);
  }, [expanded, maxWidth, width]);

  return {
    width,
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth,
    expanded,
    diffStyle,
    selectedDiffPath,
    isResizing,
    setWidth,
    resetWidth,
    setExpanded,
    toggleExpanded,
    setDiffStyle,
    toggleDiffStyle,
    setSelectedDiffPath,
    startResize,
  };
}
