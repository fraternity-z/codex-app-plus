import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { HostBridge } from "../../../bridge/types";
import type { FsReadFileResponse } from "../../../protocol/generated/v2/FsReadFileResponse";
import { MarkdownRenderer } from "../../conversation/ui/MarkdownRenderer";
import {
  getPathBaseName,
  isDocxDocumentPreview,
  isEmbeddableDocumentPreview,
  isMarkdownDocumentPreview,
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

type DocxPreviewState =
  | { readonly status: "idle"; readonly bytes: null; readonly error: null }
  | { readonly status: "loading"; readonly bytes: null; readonly error: null }
  | { readonly status: "ready"; readonly bytes: Uint8Array; readonly error: null }
  | { readonly status: "error"; readonly bytes: null; readonly error: string };

type DocxRenderState =
  | { readonly status: "loading"; readonly error: null }
  | { readonly status: "ready"; readonly error: null }
  | { readonly status: "error"; readonly error: string };

type DocxPreviewOptions = import("docx-preview").Options;

const DOCX_PREVIEW_CLASS_NAME = "codex-docx-preview";
const DOCX_PREVIEW_OPTIONS: Partial<DocxPreviewOptions> = {
  className: DOCX_PREVIEW_CLASS_NAME,
  renderAltChunks: false,
  useBase64URL: true,
};
const DOCX_PREVIEW_DEFAULT_ZOOM = 0.75;
const DOCX_PREVIEW_HORIZONTAL_PADDING_PX = 48;
const DOCX_PREVIEW_CUSTOM_STYLE_ID = "quick-preview-docx-official-style";
const DOCX_PREVIEW_MIN_SCALE = 0.1;
const DOCX_PREVIEW_ZOOM_VARIABLE = "--codex-docx-preview-zoom";
const DOCX_PREVIEW_CUSTOM_STYLE = `
  .${DOCX_PREVIEW_CLASS_NAME}-wrapper {
    min-height: 100%;
    display: flex;
    flex-flow: column;
    align-items: center;
    gap: 0.875rem;
    padding: 1.5rem 1.5rem 4.6875rem;
    box-sizing: border-box;
    width: max-content;
    min-width: 100%;
    background: var(--surface-canvas) !important;
  }

  .${DOCX_PREVIEW_CLASS_NAME}-wrapper > section.${DOCX_PREVIEW_CLASS_NAME} {
    margin: 0 !important;
    border: 1px solid var(--border-light);
    background: white !important;
    box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.05);
    transform-origin: top center;
    border-radius: 0;
    zoom: var(${DOCX_PREVIEW_ZOOM_VARIABLE}, 1);
  }
`;

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
  return new TextDecoder().decode(decodeBase64Bytes(dataBase64));
}

function decodeBase64Bytes(dataBase64: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(dataBase64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(dataBase64, "base64"));
  }
  throw new Error("当前环境不支持解码文件内容");
}

async function readFileBase64(hostBridge: HostBridge, path: string): Promise<string> {
  const response = await hostBridge.rpc.request({
    method: "fs/readFile",
    params: { path },
  });
  if (!isFsReadFileResponse(response.result)) {
    throw new Error("读取文件返回数据格式不正确");
  }
  return response.result.dataBase64;
}

async function readFileContent(hostBridge: HostBridge, path: string): Promise<string> {
  return decodeBase64Utf8(await readFileBase64(hostBridge, path));
}

async function readFileBytes(hostBridge: HostBridge, path: string): Promise<Uint8Array> {
  return decodeBase64Bytes(await readFileBase64(hostBridge, path));
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

function useDocxPreviewContent(hostBridge: HostBridge, target: QuickPreviewFileTarget): DocxPreviewState {
  const shouldReadDocx = isDocxDocumentPreview(target.extension);
  const [state, setState] = useState<DocxPreviewState>({ status: "idle", bytes: null, error: null });

  useEffect(() => {
    if (!shouldReadDocx) {
      setState({ status: "idle", bytes: null, error: null });
      return undefined;
    }

    let cancelled = false;
    setState({ status: "loading", bytes: null, error: null });
    void readFileBytes(hostBridge, target.path)
      .then((bytes) => {
        if (!cancelled) {
          setState({ status: "ready", bytes, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: "error", bytes: null, error: toErrorMessage(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hostBridge, shouldReadDocx, target.path]);

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

function appendDocxCustomStyle(styleContainer: HTMLElement): void {
  if (styleContainer.querySelector(`[data-style-id="${DOCX_PREVIEW_CUSTOM_STYLE_ID}"]`) !== null) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.styleId = DOCX_PREVIEW_CUSTOM_STYLE_ID;
  style.textContent = DOCX_PREVIEW_CUSTOM_STYLE;
  styleContainer.appendChild(style);
}

function getDocxPageContentWidth(page: HTMLElement): number {
  const pageRect = page.getBoundingClientRect();
  let minLeft = 0;
  let maxRight = Math.max(page.scrollWidth, page.offsetWidth, pageRect.width);

  const contentElements = Array.from(page.querySelectorAll<HTMLElement>("*"));
  for (const element of contentElements) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) {
      continue;
    }
    minLeft = Math.min(minLeft, rect.left - pageRect.left);
    maxRight = Math.max(maxRight, rect.right - pageRect.left, element.scrollWidth, element.offsetWidth);
  }

  return Math.max(0, maxRight - minLeft);
}

function getDocxWrapper(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(`.${DOCX_PREVIEW_CLASS_NAME}-wrapper`);
}

function getVisibleContainerWidth(container: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  let left = Math.max(0, containerRect.left);
  let right = Math.min(window.innerWidth, containerRect.right);
  let parent = container.parentElement;

  while (parent !== null && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (style.overflowX !== "visible" || style.overflow !== "visible") {
      const parentRect = parent.getBoundingClientRect();
      left = Math.max(left, parentRect.left);
      right = Math.min(right, parentRect.right);
    }
    parent = parent.parentElement;
  }

  const visibleWidth = right - left;
  if (Number.isFinite(visibleWidth) && visibleWidth > 0) {
    return visibleWidth;
  }
  const measuredWidth = containerRect.width || container.clientWidth;
  return Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : container.clientWidth;
}

function updateDocxFitZoom(container: HTMLElement): void {
  const wrapper = getDocxWrapper(container);
  wrapper?.style.removeProperty("width");
  container.style.setProperty(DOCX_PREVIEW_ZOOM_VARIABLE, "1");
  const pages = Array.from(container.querySelectorAll<HTMLElement>(`section.${DOCX_PREVIEW_CLASS_NAME}`));
  const widestPage = Math.max(
    0,
    wrapper?.scrollWidth ? wrapper.scrollWidth - DOCX_PREVIEW_HORIZONTAL_PADDING_PX : 0,
    container.scrollWidth ? container.scrollWidth - DOCX_PREVIEW_HORIZONTAL_PADDING_PX : 0,
    ...pages.map(getDocxPageContentWidth),
  );
  const visibleWidth = getVisibleContainerWidth(container);
  const availableWidth = Math.max(1, visibleWidth - DOCX_PREVIEW_HORIZONTAL_PADDING_PX);
  const scale = widestPage > 0
    ? Math.min(DOCX_PREVIEW_DEFAULT_ZOOM, Math.max(DOCX_PREVIEW_MIN_SCALE, availableWidth / widestPage))
    : DOCX_PREVIEW_DEFAULT_ZOOM;
  container.style.setProperty(DOCX_PREVIEW_ZOOM_VARIABLE, scale.toFixed(3));
  const scaledContentWidth = Math.ceil(widestPage * scale + DOCX_PREVIEW_HORIZONTAL_PADDING_PX);
  if (wrapper !== null && scaledContentWidth > visibleWidth) {
    wrapper.style.width = `${scaledContentWidth}px`;
  }
}

function DocxPreview(props: { readonly bytes: Uint8Array; readonly title: string }): JSX.Element {
  const bodyContainerRef = useRef<HTMLDivElement | null>(null);
  const styleContainerRef = useRef<HTMLDivElement | null>(null);
  const [renderState, setRenderState] = useState<DocxRenderState>({ status: "loading", error: null });

  useEffect(() => {
    const bodyContainer = bodyContainerRef.current;
    const styleContainer = styleContainerRef.current;
    if (bodyContainer === null || styleContainer === null) {
      return undefined;
    }

    let cancelled = false;
    bodyContainer.style.removeProperty(DOCX_PREVIEW_ZOOM_VARIABLE);
    bodyContainer.replaceChildren();
    styleContainer.replaceChildren();
    setRenderState({ status: "loading", error: null });

    void import("docx-preview")
      .then(({ renderAsync }) =>
        renderAsync(props.bytes, bodyContainer, styleContainer, DOCX_PREVIEW_OPTIONS)
      )
      .then(() => {
        if (!cancelled) {
          appendDocxCustomStyle(styleContainer);
          updateDocxFitZoom(bodyContainer);
          setRenderState({ status: "ready", error: null });
        }
      })
      .catch((error) => {
        bodyContainer.replaceChildren();
        styleContainer.replaceChildren();
        if (!cancelled) {
          setRenderState({ status: "error", error: toErrorMessage(error) });
        }
      });

    return () => {
      cancelled = true;
      bodyContainer.replaceChildren();
      styleContainer.replaceChildren();
    };
  }, [props.bytes]);

  useEffect(() => {
    if (renderState.status !== "ready") {
      return undefined;
    }

    const bodyContainer = bodyContainerRef.current;
    if (bodyContainer === null) {
      return undefined;
    }

    let scheduledFit: number | null = null;
    const scheduleFit = () => {
      if (scheduledFit !== null) {
        window.cancelAnimationFrame(scheduledFit);
      }
      scheduledFit = window.requestAnimationFrame(() => {
        scheduledFit = null;
        updateDocxFitZoom(bodyContainer);
      });
    };
    const handleResize = () => scheduleFit();
    scheduleFit();
    const delayedFit = window.setTimeout(scheduleFit, 100);
    const images = Array.from(bodyContainer.querySelectorAll<HTMLImageElement>("img"));
    for (const image of images) {
      image.addEventListener("load", scheduleFit);
      image.addEventListener("error", scheduleFit);
    }
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(handleResize);
    resizeObserver?.observe(bodyContainer);
    window.addEventListener("resize", handleResize);

    return () => {
      if (scheduledFit !== null) {
        window.cancelAnimationFrame(scheduledFit);
      }
      window.clearTimeout(delayedFit);
      for (const image of images) {
        image.removeEventListener("load", scheduleFit);
        image.removeEventListener("error", scheduleFit);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [renderState.status]);

  return (
    <section className="quick-preview-docx-shell" aria-busy={renderState.status === "loading"}>
      <div ref={styleContainerRef} className="quick-preview-docx-style-container" aria-hidden="true" />
      <div
        ref={bodyContainerRef}
        aria-label={props.title}
        className="quick-preview-docx-rendered"
        data-testid="docx-preview-panel"
      />
      {renderState.status === "loading" ? (
        <div className="quick-preview-status quick-preview-docx-overlay">正在渲染 DOCX 文档…</div>
      ) : null}
      {renderState.status === "error" ? (
        <div className="quick-preview-status quick-preview-error quick-preview-docx-overlay" role="alert">
          打开文件失败：{renderState.error}
        </div>
      ) : null}
    </section>
  );
}

function QuickPreviewBody(props: {
  readonly assetSrc: string;
  readonly target: QuickPreviewFileTarget;
  readonly textState: TextReadState;
  readonly docxState: DocxPreviewState;
  readonly onOpenExternal: () => void;
}): JSX.Element {
  if (props.target.fileKind === "image") {
    return (
      <div className="quick-preview-image-stage">
        <img className="quick-preview-image" src={props.assetSrc} alt={props.target.name} />
      </div>
    );
  }

  if (isDocxDocumentPreview(props.target.extension)) {
    if (props.docxState.status === "loading") {
      return <div className="quick-preview-status">正在读取 DOCX 文档…</div>;
    }
    if (props.docxState.status === "error") {
      return <div className="quick-preview-status quick-preview-error" role="alert">打开文件失败：{props.docxState.error}</div>;
    }
    if (props.docxState.status === "ready") {
      return <DocxPreview bytes={props.docxState.bytes} title={props.target.name} />;
    }
    return <DocumentFallback target={props.target} onOpenExternal={props.onOpenExternal} />;
  }

  if (isTextDocumentPreview(props.target.extension)) {
    if (props.textState.status === "loading") {
      return <div className="quick-preview-status">正在读取文件…</div>;
    }
    if (props.textState.status === "error") {
      return <div className="quick-preview-status quick-preview-error" role="alert">打开文件失败：{props.textState.error}</div>;
    }
    if (isMarkdownDocumentPreview(props.target.extension)) {
      return (
        <div className="quick-preview-markdown-scroll">
          <MarkdownRenderer
            className="quick-preview-markdown home-chat-markdown home-chat-markdown-assistant"
            enableFileLinks={false}
            markdown={props.textState.content}
          />
        </div>
      );
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
  const docxState = useDocxPreviewContent(props.hostBridge, props.target);
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
        docxState={docxState}
        onOpenExternal={() => void runAction("open")}
      />
    </section>
  );
}
