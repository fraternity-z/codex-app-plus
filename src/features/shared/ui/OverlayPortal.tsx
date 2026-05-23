import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface OverlayPortalProps {
  readonly children: ReactNode;
}

export function OverlayPortal(props: OverlayPortalProps): JSX.Element {
  if (typeof document === "undefined") {
    return <>{props.children}</>;
  }

  return <>{createPortal(props.children, document.body)}</>;
}
