import type { QuickPreviewTarget } from "../../preview/model/previewTargets";

export type WorkspaceSidePanelTab = "review" | "file" | "browser" | "preview";

export interface WorkspaceSidePanelFileTarget {
  readonly kind: "file";
  readonly path: string;
  readonly name: string;
}

export type WorkspaceSidePanelBrowserOpenRequest = {
  readonly id: number;
  readonly url: string | null;
};

export type WorkspaceSidePanelExpandedTarget =
  | { readonly kind: "review" }
  | WorkspaceSidePanelFileTarget
  | { readonly kind: "preview"; readonly target: Extract<QuickPreviewTarget, { readonly kind: "file" }> }
  | { readonly kind: "browser"; readonly openRequest: WorkspaceSidePanelBrowserOpenRequest | null };
