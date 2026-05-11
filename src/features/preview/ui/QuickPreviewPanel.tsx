import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { HostBridge } from "../../../bridge/types";
import type { FsReadFileResponse } from "../../../protocol/generated/v2/FsReadFileResponse";
import {
  getPathBaseName,
  isEmbeddableDocumentPreview,
  isTextDocumentPreview,
  type QuickPreviewTarget,
} from "../model/previewTargets";

type QuickPreviewFileTarget = Extract<QuickPreviewTarget, { readonly kind: "file" }>;

interface QuickPreviewPanelProps {
  readonly hostBridge: HostBridge;
  readonly target: QuickPreviewFileTarget;
}

type TextReadState =
  | { readonly status: "idle"; readonly content: string; readonly error: null }
  | { readonly status: "loading"; readonly content: string; readonly error: null }
  | { readonly status: "ready"; readonly content: string; readonly error: null }
  | { readonly status: "error"; readonly content: string; readonly error: string };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFsReadFileResponse(value: unknown): value is FsReadFileResponse {
  return (
    typeof value === "object"
    && value !== null
    && typeof (value as Partial<FsReadFileResponse>).dataBase64 === "string"
  );
}

function decodeBase64Utf8(dataBase64: string): string {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(dataBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(dataBase64, "base64").toString("utf8");
  }
  throw new Error("当前环境不支持解码文件内容");
}

async function readFileContent(hostBridge: HostBridge, path: string): Promise<string> {
  const response = await hostBridge.rpc.request({
    method: "fs/readFile",
    params: { path },
  });
  if (!isFsReadFileResponse(response.result)) {
    throw new Error("读取文件返回数据格式不正确");
  }
  return decodeBase64Utf8(response.result.dataBase64);
}

function useTextDocumentContent(hostBridge: HostBridge, target: QuickPreviewFileTarget): TextReadState {
  const shouldReadText = isTextDocumentPreview(target.extension);
  const [state, setState] = useState<TextReadState>({ status: "idle", content: "", error: null });

  useEffect(() => {
    if (!shouldReadText) {
      setState({ status: "idle", content: "", error: null });
      return undefined;
    }

    let cancelled = false;
    setState({ status: "loading", content: "", error: null });
    void readFileContent(hostBridge, target.path)
      .then((content) => {
        if (!cancelled) {
          setState({ status: "ready", content, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: "error", content: "", error: toErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hostBridge, shouldReadText, target.path]);

  return state;
}

function getDocumentMimeType(extension: string): string {
  const normalized = extension.toLowerCase();
  if (normalized === "pdf") return "application/pdf";
  if (normalized === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (normalized === "doc") return "application/msword";
  if (normalized === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (normalized === "ppt") return "application/vnd.ms-powerpoint";
  if (normalized === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (normalized === "xls") return "application/vnd.ms-excel";
  if (normalized === "odt") return "application/vnd.oasis.opendocument.text";
  if (normalized === "odp") return "application/vnd.oasis.opendocument.presentation";
  if (normalized === "ods") return "application/vnd.oasis.opendocument.spreadsheet";
  if (normalized === "rtf") return "application/rtf";
  return "application/octet-stream";
}

function PreviewActionIcon(props: { readonly kind: "open" | "folder" }): JSX.Element {
  if (props.kind === "folder") {
    return (
      <svg className="quick-preview-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.8 5.2a1.6 1.6 0 0 1 1.6-1.6h3l1.4 1.6h4.8a1.6 1.6 0 0 1 1.6 1.6v5a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6z" />
      </svg>
    );
  }
  return (
    <svg className="quick-preview-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.2 3.2H3.8a1.6 1.6 0 0 0-1.6 1.6v7.4a1.6 1.6 0 0 0 1.6 1.6h7.4a1.6 1.6 0 0 0 1.6-1.6V9.8" />
      <path d="M8.7 2.2h5.1v5.1" />
      <path d="m7.6 8.4 5.7-5.7" />
    </svg>
  );
}

function DocumentFallback(props: {
  readonly target: QuickPreviewFileTarget;
  readonly onOpenExternal: () => void;
}): JSX.Element {
  return (
    <div className="quick-preview-document-fallback">
      <div className="quick-preview-document-badge" aria-hidden="true">
        {props.target.extension || "DOC"}
      </div>
      <h2>{props.target.name}</h2>
      <p>当前格式可能无法直接内嵌渲染，可以用系统默认应用打开查看。</p>
      <button type="button" className="quick-preview-primary-action" onClick={props.onOpenExternal}>
        打开文件
      </button>
    </div>
  );
}

function QuickPreviewBody(props: {
  readonly assetSrc: string;
  readonly target: QuickPreviewFileTarget;
  readonly textState: TextReadState;
  readonly onOpenExternal: () => void;
}): JSX.Element {
  if (props.target.fileKind === "image") {
    return (
      <div className="quick-preview-image-stage">
        <img className="quick-preview-image" src={props.assetSrc} alt={props.target.name} />
      </div>
    );
  }

  if (isTextDocumentPreview(props.target.extension)) {
    if (props.textState.status === "loading") {
      return <div className="quick-preview-status">正在读取文件…</div>;
    }
    if (props.textState.status === "error") {
      return <div className="quick-preview-status quick-preview-error" role="alert">打开文件失败：{props.textState.error}</div>;
    }
    return (
      <div className="quick-preview-text-scroll">
        <pre className="quick-preview-text">{props.textState.content}</pre>
      </div>
    );
  }

  if (isEmbeddableDocumentPreview(props.target.extension)) {
    return (
      <object
        className="quick-preview-document-object"
        data={props.assetSrc}
        type={getDocumentMimeType(props.target.extension)}
        aria-label={`预览 ${props.target.name}`}
      >
        <DocumentFallback target={props.target} onOpenExternal={props.onOpenExternal} />
      </object>
    );
  }

  return <DocumentFallback target={props.target} onOpenExternal={props.onOpenExternal} />;
}

export function QuickPreviewPanel(props: QuickPreviewPanelProps): JSX.Element {
  const assetSrc = useMemo(() => convertFileSrc(props.target.path), [props.target.path]);
  const textState = useTextDocumentContent(props.hostBridge, props.target);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"open" | "reveal" | null>(null);

  const runAction = useCallback(async (action: "open" | "reveal") => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction(action);
    setActionError(null);
    try {
      if (action === "open") {
        await props.hostBridge.app.openExternal(props.target.path);
      } else {
        await props.hostBridge.app.revealPathInFolder({ path: props.target.path });
      }
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, props.hostBridge, props.target.path]);

  const relativeTitle = getPathBaseName(props.target.path);

  return (
    <section className="quick-preview-panel" aria-label={`预览 ${props.target.name}`}>
      <div className="quick-preview-toolbar">
        <div className="quick-preview-title-wrap">
          <h2 className="quick-preview-title">{relativeTitle}</h2>
          <p className="quick-preview-subtitle" title={props.target.path}>{props.target.path}</p>
        </div>
        <div className="quick-preview-toolbar-actions">
          <button
            type="button"
            className="quick-preview-toolbar-button"
            aria-label="在外部打开文件"
            title="在外部打开文件"
            disabled={pendingAction !== null}
            onClick={() => void runAction("open")}
          >
            <PreviewActionIcon kind="open" />
          </button>
          <button
            type="button"
            className="quick-preview-toolbar-button"
            aria-label="显示文件所在文件夹"
            title="显示文件所在文件夹"
            disabled={pendingAction !== null}
            onClick={() => void runAction("reveal")}
          >
            <PreviewActionIcon kind="folder" />
          </button>
        </div>
      </div>
      {actionError === null ? null : (
        <div className="quick-preview-action-error" role="alert">
          操作失败：{actionError}
        </div>
      )}
      <QuickPreviewBody
        assetSrc={assetSrc}
        target={props.target}
        textState={textState}
        onOpenExternal={() => void runAction("open")}
      />
    </section>
  );
}
