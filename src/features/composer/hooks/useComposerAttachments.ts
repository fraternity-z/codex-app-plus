import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import {
  createComposerAttachmentsFromPaths,
  partitionComposerPaths,
  readClipboardImageAttachment,
} from "../model/composerAttachments";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import type { ComposerAttachment } from "../../../domain/timeline";

interface UseComposerAttachmentsOptions {
  readonly onInsertFilePaths?: (paths: ReadonlyArray<string>) => void;
  readonly selectedThreadId: string | null;
}

interface ComposerAttachmentsState {
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly appendPaths: (paths: ReadonlyArray<string>) => void;
  readonly clearAttachments: () => void;
  readonly openFilePicker: () => Promise<void>;
  readonly removeAttachment: (attachmentId: string) => void;
  readonly handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
}

const DIALOG_TITLE = "Add files and photos";

export function useComposerAttachments(options: UseComposerAttachmentsOptions): ComposerAttachmentsState {
  const { notifyError } = useUiBannerNotifications("composer-attachments");
  const [attachments, setAttachments] = useState<ReadonlyArray<ComposerAttachment>>([]);
  const previousThreadIdRef = useRef(options.selectedThreadId);

  useEffect(() => {
    if (previousThreadIdRef.current === options.selectedThreadId) {
      return;
    }
    previousThreadIdRef.current = options.selectedThreadId;
    setAttachments([]);
  }, [options.selectedThreadId]);

  const appendPaths = useCallback((paths: ReadonlyArray<string>) => {
    if (paths.length === 0) {
      return;
    }
    setAttachments((current) => [...current, ...createComposerAttachmentsFromPaths(paths)]);
  }, []);
  const clearAttachments = useCallback(() => setAttachments([]), []);
  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const openFilePicker = useCallback(async () => {
    try {
      const selected = await open({ title: DIALOG_TITLE, multiple: true });
      const paths = normalizeDialogSelection(selected);
      if (paths.length > 0) {
        const partition = partitionComposerPaths(paths);
        appendPaths(partition.imagePaths);
        options.onInsertFilePaths?.(partition.filePaths);
      }
    } catch (error) {
      reportAttachmentError(notifyError, "添加文件或图片失败", error);
    }
  }, [appendPaths, notifyError, options]);

  const handlePaste = useCallback(async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = getClipboardImageFiles(event);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();

    try {
      const nextAttachments = await Promise.all(files.map((file, index) => readClipboardImageAttachment(file, index)));
      setAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      reportAttachmentError(notifyError, "读取剪贴板图片失败", error);
    }
  }, [notifyError]);

  return { attachments, appendPaths, clearAttachments, openFilePicker, removeAttachment, handlePaste };
}

function getClipboardImageFiles(event: ClipboardEvent<HTMLTextAreaElement>): Array<File> {
  return Array.from(event.clipboardData.items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function normalizeDialogSelection(selected: string | Array<string> | null): Array<string> {
  if (selected === null) {
    return [];
  }
  return Array.isArray(selected) ? selected : [selected];
}

function reportAttachmentError(
  notifyError: (title: string, error: unknown, detail?: string | null) => void,
  message: string,
  error: unknown,
): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(message, error);
  notifyError(message, error, detail);
}
