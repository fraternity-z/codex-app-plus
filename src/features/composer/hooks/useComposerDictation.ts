import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Locale } from "../../../i18n/types";
import {
  appendDictationTranscript,
  isComposerDictationTranscriptionSupported,
  isDictationPermissionDeniedError,
  startComposerDictationTranscriptionSession,
  type ComposerDictationTranscriptionSession,
  type DictationErrorHandler,
} from "../service/composerDictationTranscription";

export {
  appendDictationTranscript,
  isDictationPermissionDeniedError,
};

export interface ComposerDictation {
  readonly listening: boolean;
  readonly pending: boolean;
  readonly phase: "idle" | "starting" | "recording" | "transcribing";
  readonly supported: boolean;
  readonly audioLevel: number;
  readonly elapsedSeconds: number;
  readonly toggle: () => void;
  readonly stop: () => void;
}

export function useComposerDictation(args: {
  readonly disabled: boolean;
  readonly locale: Locale;
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly text: string;
  readonly onError: DictationErrorHandler;
  readonly onTextChange: (text: string, caret: number) => void;
}): ComposerDictation {
  const sessionRef = useRef<ComposerDictationTranscriptionSession | null>(null);
  const committedTextRef = useRef(args.text);
  const textRef = useRef(args.text);
  const onErrorRef = useRef(args.onError);
  const onTextChangeRef = useRef(args.onTextChange);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<ComposerDictation["phase"]>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [supported, setSupported] = useState(() => isComposerDictationTranscriptionSupported());

  useEffect(() => {
    textRef.current = args.text;
  }, [args.text]);

  useEffect(() => {
    onErrorRef.current = args.onError;
  }, [args.onError]);

  useEffect(() => {
    onTextChangeRef.current = args.onTextChange;
  }, [args.onTextChange]);

  useEffect(() => {
    setSupported(isComposerDictationTranscriptionSupported());
  }, []);

  useEffect(() => {
    if (!listening) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const intervalId = globalThis.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [listening]);

  const restoreTextareaFocus = useCallback(() => {
    focusTextareaAt(args.textareaRef.current, textRef.current.length);
  }, [args.textareaRef]);

  const applyTranscript = useCallback((transcript: string) => {
    const nextText = appendDictationTranscript(committedTextRef.current, transcript);
    if (nextText === textRef.current) {
      return;
    }
    committedTextRef.current = nextText;
    textRef.current = nextText;
    onTextChangeRef.current(nextText, nextText.length);
    restoreTextareaFocus();
  }, [restoreTextareaFocus]);

  const endSession = useCallback(() => {
    sessionRef.current = null;
    setAudioLevel(0);
    setListening(false);
    setPending(false);
    setPhase("idle");
    restoreTextareaFocus();
  }, [restoreTextareaFocus]);

  const start = useCallback(async () => {
    if (args.disabled || pending) {
      return;
    }

    if (!isComposerDictationTranscriptionSupported()) {
      setSupported(false);
      onErrorRef.current(new Error("Audio recording is not available in this environment."));
      return;
    }

    setSupported(true);
    setPending(true);
    setPhase("starting");
    try {
      committedTextRef.current = textRef.current;
      const session = await startComposerDictationTranscriptionSession({
        locale: args.locale,
        callbacks: {
          onAudioLevel: setAudioLevel,
          onEnd: endSession,
          onError: (error) => onErrorRef.current(error),
          onTranscript: applyTranscript,
          onTranscribingStart: () => {
            setAudioLevel(0);
            setListening(false);
            setPending(true);
            setPhase("transcribing");
            restoreTextareaFocus();
          },
        },
      });
      sessionRef.current = session;
      setListening(true);
      setPhase("recording");
      restoreTextareaFocus();
    } catch (error) {
      sessionRef.current = null;
      setAudioLevel(0);
      setListening(false);
      setPhase("idle");
      onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setPending(false);
    }
  }, [applyTranscript, args.disabled, args.locale, endSession, pending, restoreTextareaFocus]);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    restoreTextareaFocus();
  }, [restoreTextareaFocus]);

  const toggle = useCallback(() => {
    if (sessionRef.current !== null) {
      stop();
      return;
    }
    void start();
  }, [start, stop]);

  useEffect(() => () => {
    sessionRef.current?.abort();
    sessionRef.current = null;
  }, []);

  return { listening, pending, phase, supported, audioLevel, elapsedSeconds, toggle, stop };
}

function focusTextareaAt(textarea: HTMLTextAreaElement | null, caret: number): void {
  if (textarea === null) {
    return;
  }
  const schedule = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 0);
  schedule(() => {
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
  globalThis.setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  }, 0);
}
