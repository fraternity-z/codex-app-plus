import { useEffect, useMemo, useState } from "react";
import type { PetOption } from "../model/petCatalog";

const GRID_COLUMNS = 8;
const GRID_ROWS = 9;
const IDLE_SLOWDOWN = 6;

export type PetAnimationState =
  | "failed"
  | "idle"
  | "jumping"
  | "review"
  | "running"
  | "running-left"
  | "running-right"
  | "waving"
  | "waiting";

interface PetAnimationFrame {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly frameDurationMs: number;
}

interface PetAnimationSequence {
  readonly frames: ReadonlyArray<PetAnimationFrame>;
  readonly loopStartIndex: number | null;
}

const IDLE_FRAMES: ReadonlyArray<PetAnimationFrame> = [
  { rowIndex: 0, columnIndex: 0, frameDurationMs: 280 },
  { rowIndex: 0, columnIndex: 1, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 2, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 3, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 4, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 5, frameDurationMs: 320 },
];

const SLOW_IDLE_FRAMES = IDLE_FRAMES.map((frame) => ({
  ...frame,
  frameDurationMs: frame.frameDurationMs * IDLE_SLOWDOWN,
}));

const PET_ANIMATIONS: Record<PetAnimationState, ReadonlyArray<PetAnimationFrame>> = {
  failed: createRowFrames(5, 8, 140, 240),
  idle: SLOW_IDLE_FRAMES,
  jumping: createRowFrames(4, 5, 140, 280),
  review: createRowFrames(8, 6, 150, 280),
  running: createRowFrames(7, 6, 120, 220),
  "running-left": createRowFrames(2, 8, 120, 220),
  "running-right": createRowFrames(1, 8, 120, 220),
  waving: createRowFrames(3, 4, 140, 280),
  waiting: createRowFrames(6, 6, 150, 260),
};

function createRowFrames(
  rowIndex: number,
  count: number,
  frameDurationMs: number,
  lastFrameDurationMs: number,
): ReadonlyArray<PetAnimationFrame> {
  return Array.from({ length: count }, (_, columnIndex) => ({
    rowIndex,
    columnIndex,
    frameDurationMs: columnIndex === count - 1 ? lastFrameDurationMs : frameDurationMs,
  }));
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);
    return () => {
      mediaQuery.removeEventListener?.("change", handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

function createPetAnimationSequence(
  state: PetAnimationState,
  prefersReducedMotion: boolean,
): PetAnimationSequence {
  const frames = PET_ANIMATIONS[state] ?? SLOW_IDLE_FRAMES;
  if (prefersReducedMotion) {
    return {
      frames: [frames[0] ?? SLOW_IDLE_FRAMES[0]],
      loopStartIndex: null,
    };
  }
  if (state === "idle") {
    return {
      frames: SLOW_IDLE_FRAMES,
      loopStartIndex: 0,
    };
  }

  const activeFrames = [...frames, ...frames, ...frames];
  return {
    frames: [...activeFrames, ...SLOW_IDLE_FRAMES],
    loopStartIndex: activeFrames.length,
  };
}

function usePetAnimationFrame(state: PetAnimationState): PetAnimationFrame {
  const prefersReducedMotion = usePrefersReducedMotion();
  const sequence = useMemo(
    () => createPetAnimationSequence(state, prefersReducedMotion),
    [prefersReducedMotion, state],
  );
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [sequence]);

  useEffect(() => {
    const frames = sequence.frames;
    const frame = frames[frameIndex] ?? frames[0] ?? SLOW_IDLE_FRAMES[0];
    if (frames.length <= 1) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setFrameIndex((current) => {
        const next = current + 1;
        if (next < frames.length) {
          return next;
        }
        return sequence.loopStartIndex ?? current;
      });
    }, frame.frameDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [frameIndex, sequence]);

  return sequence.frames[frameIndex] ?? sequence.frames[0] ?? SLOW_IDLE_FRAMES[0];
}

function backgroundPosition(frame: PetAnimationFrame): string {
  const x = (frame.columnIndex / (GRID_COLUMNS - 1)) * 100;
  const y = (frame.rowIndex / (GRID_ROWS - 1)) * 100;
  return `${x}% ${y}%`;
}

export function CodexPetAvatar(props: {
  readonly pet: Pick<PetOption, "displayName" | "spritesheetUrl">;
  readonly state?: PetAnimationState;
  readonly className?: string;
  readonly sizeRem?: number;
}): JSX.Element {
  const state = props.state ?? "idle";
  const frame = usePetAnimationFrame(state);
  return (
    <div
      aria-label={props.pet.displayName}
      className={["codex-pet-avatar", props.className].filter(Boolean).join(" ")}
      data-pet-state={state}
      role="img"
      style={{
        backgroundImage: `url(${props.pet.spritesheetUrl})`,
        backgroundPosition: backgroundPosition(frame),
        width: props.sizeRem === undefined ? undefined : `${props.sizeRem}rem`,
      }}
    />
  );
}
