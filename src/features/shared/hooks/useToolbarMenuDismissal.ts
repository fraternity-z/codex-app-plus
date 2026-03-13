import { useEffect } from "react";
import type { RefObject } from "react";

export function useToolbarMenuDismissal(
  menuOpen: boolean,
  containerRef: RefObject<HTMLDivElement>,
  onDismiss: () => void
): void {
  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onDismiss();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, menuOpen, onDismiss]);
}
