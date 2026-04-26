import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Locale } from "../../../i18n/types";

type DictationErrorHandler = (error: Error) => void;

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
  readonly message?: string;
}

interface ComposerSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type ComposerSpeechRecognitionConstructor = new () => ComposerSpeechRecognition;

interface SpeechRecognitionGlobal {
  readonly SpeechRecognition?: ComposerSpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: ComposerSpeechRecognitionConstructor;
}

export interface ComposerDictation {
  readonly listening: boolean;
  readonly pending: boolean;
  readonly supported: boolean;
  readonly toggle: () => void;
  readonly stop: () => void;
}

const DICTATION_PERMISSION_DENIED_ERROR = "DictationPermissionDeniedError";

export function resolveComposerSpeechRecognitionConstructor(scope: unknown): ComposerSpeechRecognitionConstructor | null {
  const candidate = scope as SpeechRecognitionGlobal | null | undefined;
  return candidate?.SpeechRecognition ?? candidate?.webkitSpeechRecognition ?? null;
}

export function appendDictationTranscript(text: string, transcript: string): string {
  const normalizedTranscript = transcript.trim();
  if (normalizedTranscript.length === 0) {
    return text;
  }
  if (text.trim().length === 0 || /\s$/.test(text) || /^[,.;:!?，。；：！？、）)]/.test(normalizedTranscript)) {
    return `${text}${normalizedTranscript}`;
  }
  if (endsWithCjk(text) || startsWithCjk(normalizedTranscript)) {
    return `${text}${normalizedTranscript}`;
  }
  return `${text} ${normalizedTranscript}`;
}

export function collectFinalDictationTranscript(event: SpeechRecognitionEventLike): string {
  let transcript = "";
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (!result.isFinal) {
      continue;
    }
    transcript += result[0]?.transcript ?? "";
  }
  return transcript;
}

export function isDictationPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && error.name === DICTATION_PERMISSION_DENIED_ERROR;
}

export function useComposerDictation(args: {
  readonly disabled: boolean;
  readonly locale: Locale;
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly text: string;
  readonly onError: DictationErrorHandler;
  readonly onTextChange: (text: string, caret: number) => void;
}): ComposerDictation {
  const recognitionRef = useRef<ComposerSpeechRecognition | null>(null);
  const textRef = useRef(args.text);
  const onErrorRef = useRef(args.onError);
  const onTextChangeRef = useRef(args.onTextChange);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [supported, setSupported] = useState(() => resolveComposerSpeechRecognitionConstructor(globalThis) !== null);

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
    setSupported(resolveComposerSpeechRecognitionConstructor(globalThis) !== null);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (args.disabled || pending) {
      return;
    }

    const SpeechRecognitionConstructor = resolveComposerSpeechRecognitionConstructor(globalThis);
    if (SpeechRecognitionConstructor === null) {
      setSupported(false);
      onErrorRef.current(new Error("Speech recognition is not available in this environment."));
      return;
    }

    setPending(true);
    let permissionProbe: MediaStream | null = null;
    try {
      permissionProbe = await requestMicrophoneCapture();
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.lang = args.locale === "zh-CN" ? "zh-CN" : "en-US";
      recognition.onresult = (event) => {
        const transcript = collectFinalDictationTranscript(event);
        const nextText = appendDictationTranscript(textRef.current, transcript);
        if (nextText === textRef.current) {
          return;
        }
        textRef.current = nextText;
        onTextChangeRef.current(nextText, nextText.length);
        focusTextareaAt(args.textareaRef.current, nextText.length);
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        onErrorRef.current(createSpeechRecognitionError(event));
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) {
          return;
        }
        recognitionRef.current = null;
        setListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (error) {
      recognitionRef.current = null;
      setListening(false);
      onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
    } finally {
      stopMicrophoneProbe(permissionProbe);
      setPending(false);
    }
  }, [args.disabled, args.locale, args.textareaRef, pending]);

  const toggle = useCallback(() => {
    if (recognitionRef.current !== null) {
      stop();
      return;
    }
    void start();
  }, [start, stop]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  return { listening, pending, supported, toggle, stop };
}

async function requestMicrophoneCapture(): Promise<MediaStream | null> {
  if (navigator.mediaDevices?.getUserMedia === undefined) {
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw createMicrophonePermissionError(error);
  }
}

function stopMicrophoneProbe(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
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
}

function createSpeechRecognitionError(event: SpeechRecognitionErrorEventLike): Error {
  if (event.error === "not-allowed" || event.error === "service-not-allowed") {
    return createMicrophonePermissionError(event.message ?? event.error);
  }
  if (event.message !== undefined && event.message.length > 0) {
    return new Error(event.message);
  }
  if (event.error !== undefined && event.error.length > 0) {
    return new Error(`Speech recognition failed: ${event.error}`);
  }
  return new Error("Speech recognition failed.");
}

function createMicrophonePermissionError(cause: unknown): Error {
  const error = new Error("Microphone permission was denied.");
  error.name = DICTATION_PERMISSION_DENIED_ERROR;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function endsWithCjk(value: string): boolean {
  return /[\u3400-\u9fff]$/.test(value);
}

function startsWithCjk(value: string): boolean {
  return /^[\u3400-\u9fff]/.test(value);
}
