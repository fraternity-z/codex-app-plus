import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import type { PetOption } from "../model/petCatalog";
import {
  CodexPetAvatar,
  type PetAnimationState,
} from "./CodexPetAvatar";

const PET_OVERLAY_MARGIN_PX = 28;
const PET_OVERLAY_WIDTH_PX = 113;
const PET_OVERLAY_HEIGHT_PX = 122;
const PET_DRAG_THRESHOLD_PX = 4;

interface PetOverlayPosition {
  readonly left: number;
  readonly top: number;
}

interface PetOverlayMenuState {
  readonly x: number;
  readonly y: number;
}

interface PetDragSession {
  readonly pointerId: number | null;
  readonly originLeft: number;
  readonly originTop: number;
  readonly startClientX: number;
  readonly startClientY: number;
  lastClientX: number;
  lastClientY: number;
  hasMoved: boolean;
}

function getInitialPetOverlayPosition(): PetOverlayPosition {
  if (typeof window === "undefined") {
    return { left: PET_OVERLAY_MARGIN_PX, top: PET_OVERLAY_MARGIN_PX };
  }
  return {
    left: Math.max(
      PET_OVERLAY_MARGIN_PX,
      window.innerWidth - PET_OVERLAY_WIDTH_PX - PET_OVERLAY_MARGIN_PX,
    ),
    top: Math.max(
      PET_OVERLAY_MARGIN_PX,
      window.innerHeight - PET_OVERLAY_HEIGHT_PX - PET_OVERLAY_MARGIN_PX,
    ),
  };
}

function clampPetOverlayPosition(
  position: PetOverlayPosition,
  overlayElement: HTMLDivElement | null,
): PetOverlayPosition {
  if (typeof window === "undefined") {
    return position;
  }
  const rect = overlayElement?.getBoundingClientRect();
  const width = rect && rect.width > 0 ? rect.width : PET_OVERLAY_WIDTH_PX;
  const height = rect && rect.height > 0 ? rect.height : PET_OVERLAY_HEIGHT_PX;
  return {
    left: Math.min(Math.max(0, position.left), Math.max(0, window.innerWidth - width)),
    top: Math.min(Math.max(0, position.top), Math.max(0, window.innerHeight - height)),
  };
}

function PetOverlayContextMenu(props: {
  readonly closeLabel: string;
  readonly menuLabel: string;
  readonly x: number;
  readonly y: number;
  onClose: () => void;
  onClosePet: () => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useToolbarMenuDismissal(true, containerRef, props.onClose);

  const menu = (
    <div
      ref={containerRef}
      className="thread-context-menu codex-pet-context-menu"
      style={{ left: props.x, top: props.y }}
      role="menu"
      aria-label={props.menuLabel}
    >
      <button
        type="button"
        className="thread-context-menu-item thread-context-menu-item-danger"
        role="menuitem"
        onClick={() => {
          props.onClosePet();
          props.onClose();
        }}
      >
        {props.closeLabel}
      </button>
    </div>
  );

  return <>{typeof document === "undefined" ? menu : createPortal(menu, document.body)}</>;
}

export function CodexPetOverlay(props: {
  readonly pet: PetOption;
  readonly closeLabel: string;
  onClose: () => void;
}): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<PetDragSession | null>(null);
  const [hovering, setHovering] = useState(false);
  const [position, setPosition] = useState(getInitialPetOverlayPosition);
  const [menuState, setMenuState] = useState<PetOverlayMenuState | null>(null);
  const [dragAnimationState, setDragAnimationState] = useState<PetAnimationState | null>(null);
  const isDragging = dragAnimationState !== null;

  const finishDrag = useCallback((pointerId: number | null) => {
    const dragSession = dragSessionRef.current;
    if (dragSession === null || dragSession.pointerId !== pointerId) {
      return;
    }
    dragSessionRef.current = null;
    if (pointerId !== null && overlayRef.current?.hasPointerCapture?.(pointerId)) {
      overlayRef.current.releasePointerCapture(pointerId);
    }
    setDragAnimationState(null);
  }, []);

  const startDrag = useCallback((
    pointerId: number | null,
    clientX: number,
    clientY: number,
  ) => {
    setMenuState(null);
    dragSessionRef.current = {
      pointerId,
      originLeft: position.left,
      originTop: position.top,
      startClientX: clientX,
      startClientY: clientY,
      lastClientX: clientX,
      lastClientY: clientY,
      hasMoved: false,
    };
  }, [position.left, position.top]);

  const moveDrag = useCallback((
    pointerId: number | null,
    clientX: number,
    clientY: number,
  ) => {
    const dragSession = dragSessionRef.current;
    if (dragSession === null || dragSession.pointerId !== pointerId) {
      return;
    }

    const totalDeltaX = clientX - dragSession.startClientX;
    const totalDeltaY = clientY - dragSession.startClientY;
    const frameDeltaX = clientX - dragSession.lastClientX;
    const frameDeltaY = clientY - dragSession.lastClientY;

    if (
      Math.abs(totalDeltaX) >= PET_DRAG_THRESHOLD_PX
      || Math.abs(totalDeltaY) >= PET_DRAG_THRESHOLD_PX
    ) {
      dragSession.hasMoved = true;
    }

    if (!dragSession.hasMoved) {
      return;
    }

    dragSession.lastClientX = clientX;
    dragSession.lastClientY = clientY;
    setPosition(
      clampPetOverlayPosition(
        {
          left: dragSession.originLeft + totalDeltaX,
          top: dragSession.originTop + totalDeltaY,
        },
        overlayRef.current,
      ),
    );

    if (Math.abs(frameDeltaX) >= PET_DRAG_THRESHOLD_PX) {
      setDragAnimationState(frameDeltaX > 0 ? "running-right" : "running-left");
    } else if (Math.abs(frameDeltaY) >= PET_DRAG_THRESHOLD_PX) {
      setDragAnimationState("running");
    }
  }, []);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => finishDrag(event.pointerId);
    const handlePointerCancel = (event: PointerEvent) => finishDrag(event.pointerId);

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [finishDrag]);

  useEffect(() => {
    if (typeof window.PointerEvent === "function") {
      return undefined;
    }
    const handleMouseUp = () => finishDrag(null);

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [finishDrag]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => clampPetOverlayPosition(current, overlayRef.current));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setMenuState({ x: event.clientX, y: event.clientY });
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startDrag(event.pointerId, event.clientX, event.clientY);
  }, [startDrag]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    moveDrag(event.pointerId, event.clientX, event.clientY);
  }, [moveDrag]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (typeof window.PointerEvent === "function" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    startDrag(null, event.clientX, event.clientY);
  }, [startDrag]);

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (typeof window.PointerEvent === "function") {
      return;
    }
    moveDrag(null, event.clientX, event.clientY);
  }, [moveDrag]);

  const avatarState = dragAnimationState ?? (hovering ? "jumping" : "idle");

  return (
    <>
      <div
        ref={overlayRef}
        className={[
          "codex-pet-overlay",
          isDragging ? "codex-pet-overlay-dragging" : "",
        ].filter(Boolean).join(" ")}
        style={{ left: position.left, top: position.top }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => finishDrag(null)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event.pointerId)}
        onLostPointerCapture={(event) => finishDrag(event.pointerId)}
      >
        <CodexPetAvatar
          className="codex-pet-overlay-avatar"
          pet={props.pet}
          sizeRem={7.04}
          state={avatarState}
        />
      </div>
      {menuState !== null && (
        <PetOverlayContextMenu
          closeLabel={props.closeLabel}
          menuLabel={props.pet.displayName}
          x={menuState.x}
          y={menuState.y}
          onClose={() => setMenuState(null)}
          onClosePet={props.onClose}
        />
      )}
    </>
  );
}
