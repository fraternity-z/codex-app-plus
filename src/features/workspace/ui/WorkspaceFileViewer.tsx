import { useCallback, useEffect, useMemo, useState } from "react";
import type { HostBridge } from "../../../bridge/types";
import type { FsReadFileResponse } from "../../../protocol/generated/v2/FsReadFileResponse";
import { HighlightedCodeContent } from "../../git/ui/diffCodeHighlight";
import {
  normalizeLocalCodeCommentPath,
  type CreateLocalCodeCommentInput,
  type LocalCodeComment,
} from "../model/localCodeComments";

interface WorkspaceFileViewerProps {
  readonly hostBridge: HostBridge;
  readonly rootPath: string | null;
  readonly path: string;
  readonly comments?: ReadonlyArray<LocalCodeComment>;
  readonly onCreateComment?: (input: CreateLocalCodeCommentInput) => void;
  readonly onDeleteComment?: (commentId: string) => void;
}

type FileReadState =
  | { readonly status: "loading"; readonly content: string; readonly error: null }
  | { readonly status: "ready"; readonly content: string; readonly error: null }
  | { readonly status: "error"; readonly content: string; readonly error: string };

const EMPTY_COMMENTS: ReadonlyArray<LocalCodeComment> = [];

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

function getBaseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

function getRelativePath(rootPath: string | null, path: string): string {
  if (rootPath === null) {
    return normalizeSeparators(path);
  }
  const normalizedRoot = normalizeSeparators(rootPath).replace(/\/+$/, "");
  const normalizedPath = normalizeSeparators(path);
  const comparableRoot = normalizedRoot.toLowerCase();
  const comparablePath = normalizedPath.toLowerCase();
  if (comparablePath === comparableRoot) {
    return getBaseName(path);
  }
  if (comparablePath.startsWith(`${comparableRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

function getBreadcrumbSegments(rootPath: string | null, relativePath: string): ReadonlyArray<string> {
  const segments = normalizeSeparators(relativePath).split("/").filter(Boolean);
  if (rootPath === null) {
    return segments.length > 0 ? segments : [relativePath];
  }
  return [getBaseName(rootPath), ...segments];
}

function splitFileLines(content: string): ReadonlyArray<string> {
  if (content.length === 0) {
    return [""];
  }
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
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

function useWorkspaceFileContent(hostBridge: HostBridge, path: string): FileReadState {
  const [state, setState] = useState<FileReadState>({ status: "loading", content: "", error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", content: "", error: null });
    void readFileContent(hostBridge, path)
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
  }, [hostBridge, path]);

  return state;
}

function LocalCommentEditor(props: {
  readonly line: number;
  readonly pending: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}): JSX.Element {
  return (
    <div className="workspace-file-local-comment-editor">
      <div className="workspace-file-local-comment-editor-header">
        <strong>本地评论</strong>
        <span>对第 R{props.line} 行发布评论</span>
      </div>
      <textarea
        className="workspace-file-local-comment-input"
        value={props.value}
        placeholder="请求更改"
        rows={3}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
      <div className="workspace-file-local-comment-actions">
        <button type="button" className="workspace-file-local-comment-cancel" onClick={props.onCancel}>
          取消
        </button>
        <button type="button" className="workspace-file-local-comment-save" disabled={props.pending} onClick={props.onSave}>
          注释
        </button>
      </div>
    </div>
  );
}

function LocalCommentCard(props: {
  readonly comment: LocalCodeComment;
  readonly onDelete?: (commentId: string) => void;
}): JSX.Element {
  return (
    <div className="workspace-file-local-comment-card">
      <div className="workspace-file-local-comment-card-header">
        <strong>本地评论</strong>
        <span>R{props.comment.line}</span>
      </div>
      <p>{props.comment.text}</p>
      {props.onDelete === undefined ? null : (
        <button type="button" className="workspace-file-local-comment-delete" onClick={() => props.onDelete?.(props.comment.id)}>
          删除
        </button>
      )}
    </div>
  );
}

function WorkspaceFileLine(props: {
  readonly path: string;
  readonly lineNumber: number;
  readonly content: string;
  readonly comments: ReadonlyArray<LocalCodeComment>;
  readonly draftLine: number | null;
  readonly draftText: string;
  readonly onBeginComment: (line: number) => void;
  readonly onCancelComment: () => void;
  readonly onChangeDraftText: (value: string) => void;
  readonly onSaveComment: (line: number, lineText: string) => void;
  readonly onDeleteComment?: (commentId: string) => void;
  readonly canComment: boolean;
}): JSX.Element {
  const editorOpen = props.draftLine === props.lineNumber;
  const trimmedDraft = props.draftText.trim();

  return (
    <div className="workspace-file-line-block">
      <div className="workspace-file-code-row">
        <span className="workspace-file-line-number">{props.lineNumber}</span>
        <span className="workspace-file-line-action-slot">
          {props.canComment ? (
            <button
              type="button"
              className="workspace-file-line-comment-button"
              aria-label={`评论第 ${props.lineNumber} 行`}
              onClick={() => props.onBeginComment(props.lineNumber)}
            >
              +
            </button>
          ) : null}
        </span>
        <HighlightedCodeContent className="workspace-file-code-content" content={props.content} path={props.path} />
      </div>
      {editorOpen ? (
        <LocalCommentEditor
          line={props.lineNumber}
          pending={trimmedDraft.length === 0}
          value={props.draftText}
          onChange={props.onChangeDraftText}
          onCancel={props.onCancelComment}
          onSave={() => props.onSaveComment(props.lineNumber, props.content)}
        />
      ) : null}
      {props.comments.map((comment) => (
        <LocalCommentCard key={comment.id} comment={comment} onDelete={props.onDeleteComment} />
      ))}
    </div>
  );
}

function WorkspaceFileBreadcrumb(props: {
  readonly segments: ReadonlyArray<string>;
}): JSX.Element {
  return (
    <nav className="workspace-file-viewer-breadcrumb" aria-label="文件路径">
      {props.segments.map((segment, index) => (
        <span key={`${index}-${segment}`} className="workspace-file-viewer-breadcrumb-group">
          {index === 0 ? null : <span className="workspace-file-viewer-breadcrumb-separator">›</span>}
          <span className="workspace-file-viewer-breadcrumb-item">{segment}</span>
        </span>
      ))}
    </nav>
  );
}

function EllipsisIcon(): JSX.Element {
  return (
    <svg className="workspace-file-viewer-action-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <circle cx="3.5" cy="8" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="12.5" cy="8" r="1.1" />
    </svg>
  );
}

function OpenInNewIcon(): JSX.Element {
  return (
    <svg className="workspace-file-viewer-action-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <path d="M6.2 3.2H3.8a1.6 1.6 0 0 0-1.6 1.6v7.4a1.6 1.6 0 0 0 1.6 1.6h7.4a1.6 1.6 0 0 0 1.6-1.6V9.8" />
      <path d="M8.7 2.2h5.1v5.1" />
      <path d="m7.6 8.4 5.7-5.7" />
    </svg>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="workspace-file-viewer-action-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <path d="M1.8 5.2a1.6 1.6 0 0 1 1.6-1.6h3l1.4 1.6h4.8a1.6 1.6 0 0 1 1.6 1.6v5a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6z" />
    </svg>
  );
}

function WorkspaceFileToolbarActions(): JSX.Element {
  return (
    <div className="workspace-file-viewer-actions" aria-label="文件操作">
      <button type="button" className="workspace-file-viewer-icon-button" aria-label="更多文件操作">
        <EllipsisIcon />
      </button>
      <button type="button" className="workspace-file-viewer-icon-button" aria-label="在外部打开文件">
        <OpenInNewIcon />
      </button>
      <button type="button" className="workspace-file-viewer-icon-button" aria-label="显示文件所在文件夹">
        <FolderIcon />
      </button>
    </div>
  );
}

export function WorkspaceFileViewer(props: WorkspaceFileViewerProps): JSX.Element {
  const readState = useWorkspaceFileContent(props.hostBridge, props.path);
  const [draftLine, setDraftLine] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const relativePath = useMemo(() => getRelativePath(props.rootPath, props.path), [props.path, props.rootPath]);
  const breadcrumbSegments = useMemo(() => getBreadcrumbSegments(props.rootPath, relativePath), [props.rootPath, relativePath]);
  const comments = props.comments ?? EMPTY_COMMENTS;
  const fileComments = useMemo(
    () => comments
      .filter((comment) => normalizeLocalCodeCommentPath(comment.filePath) === normalizeLocalCodeCommentPath(props.path))
      .sort((left, right) => left.line - right.line || left.createdAt.localeCompare(right.createdAt)),
    [comments, props.path],
  );
  const commentsByLine = useMemo(() => {
    const byLine = new Map<number, Array<LocalCodeComment>>();
    for (const comment of fileComments) {
      const current = byLine.get(comment.line) ?? [];
      current.push(comment);
      byLine.set(comment.line, current);
    }
    return byLine;
  }, [fileComments]);
  const lines = useMemo(() => splitFileLines(readState.content), [readState.content]);
  const beginComment = useCallback((line: number) => {
    setDraftLine(line);
    setDraftText("");
  }, []);
  const cancelComment = useCallback(() => {
    setDraftLine(null);
    setDraftText("");
  }, []);
  const saveComment = useCallback((line: number, lineText: string) => {
    const text = draftText.trim();
    if (text.length === 0 || props.onCreateComment === undefined) {
      return;
    }
    props.onCreateComment({
      rootPath: props.rootPath,
      filePath: props.path,
      line,
      lineText,
      text,
    });
    setDraftLine(null);
    setDraftText("");
  }, [draftText, props]);

  return (
    <section className="workspace-file-viewer" aria-label={`文件 ${getBaseName(props.path)}`}>
      <div className="workspace-file-viewer-toolbar">
        <WorkspaceFileBreadcrumb segments={breadcrumbSegments} />
        <WorkspaceFileToolbarActions />
      </div>
      {readState.status === "loading" ? (
        <div className="workspace-file-viewer-status">正在读取文件…</div>
      ) : readState.status === "error" ? (
        <div className="workspace-file-viewer-status workspace-file-viewer-error" role="alert">
          打开文件失败：{readState.error}
        </div>
      ) : (
        <div className="workspace-file-viewer-scroll">
          <div className="workspace-file-code-table">
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              return (
                <WorkspaceFileLine
                  key={lineNumber}
                  path={props.path}
                  lineNumber={lineNumber}
                  content={line}
                  comments={commentsByLine.get(lineNumber) ?? EMPTY_COMMENTS}
                  draftLine={draftLine}
                  draftText={draftText}
                  onBeginComment={beginComment}
                  onCancelComment={cancelComment}
                  onChangeDraftText={setDraftText}
                  onSaveComment={saveComment}
                  onDeleteComment={props.onDeleteComment}
                  canComment={props.onCreateComment !== undefined}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
