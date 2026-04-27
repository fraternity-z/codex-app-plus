import { invoke } from "@tauri-apps/api/core";
import type { Locale } from "../../../i18n/types";

export type DictationErrorHandler = (error: Error) => void;
export type DictationAudioLevelHandler = (level: number) => void;

export interface ComposerDictationTranscriptionSession {
  readonly source: "systemAudio";
  stop: () => void;
  abort: () => void;
}

export interface ComposerDictationTranscriptionCallbacks {
  readonly onAudioLevel: DictationAudioLevelHandler;
  readonly onEnd: () => void;
  readonly onError: DictationErrorHandler;
  readonly onTranscript: (text: string) => void;
  readonly onTranscribingStart: () => void;
}

export interface StartComposerDictationTranscriptionSessionArgs {
  readonly locale: Locale;
  readonly callbacks: ComposerDictationTranscriptionCallbacks;
}

type ComposerAudioContextConstructor = new () => AudioContext;
type DictationTranscriber = (args: {
  readonly audioBase64: string;
  readonly locale: string;
}) => Promise<string>;

interface AudioContextGlobal {
  readonly AudioContext?: ComposerAudioContextConstructor;
  readonly webkitAudioContext?: ComposerAudioContextConstructor;
}

const DICTATION_PERMISSION_DENIED_ERROR = "DictationPermissionDeniedError";
const DICTATION_CHUNK_SIZE = 4096;
const DICTATION_TARGET_SAMPLE_RATE = 16000;
const DICTATION_MIN_SAMPLE_COUNT = Math.floor(DICTATION_TARGET_SAMPLE_RATE * 1.25);
const WAV_HEADER_BYTE_LENGTH = 44;

let testTranscriber: DictationTranscriber | null = null;

export function setComposerDictationTranscriberForTest(transcriber: DictationTranscriber | null): void {
  testTranscriber = transcriber;
}

export function isComposerDictationTranscriptionSupported(scope: unknown = globalThis): boolean {
  return navigator.mediaDevices?.getUserMedia !== undefined
    && resolveComposerAudioContextConstructor(scope) !== null;
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

export function isDictationPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && error.name === DICTATION_PERMISSION_DENIED_ERROR;
}

export async function startComposerDictationTranscriptionSession(
  args: StartComposerDictationTranscriptionSessionArgs,
): Promise<ComposerDictationTranscriptionSession> {
  const recorder = await startSystemAudioRecorder(args.callbacks.onAudioLevel);
  let ended = false;
  let aborted = false;
  let stopRequested = false;

  const finish = () => {
    if (ended) {
      return;
    }
    ended = true;
    args.callbacks.onAudioLevel(0);
    args.callbacks.onEnd();
  };

  const stopAndTranscribe = async () => {
    if (ended || stopRequested) {
      return;
    }
    stopRequested = true;
    args.callbacks.onTranscribingStart();
    try {
      const wavBytes = await recorder.stop();
      if (!aborted && wavBytes.length > WAV_HEADER_BYTE_LENGTH) {
        const transcript = await transcribeDictationAudio({
          audioBase64: bytesToBase64(wavBytes),
          locale: resolveDictationLanguage(args.locale),
        });
        if (transcript.trim().length > 0) {
          args.callbacks.onTranscript(transcript);
        }
      }
    } catch (error) {
      if (!aborted) {
        args.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      if (!aborted) {
        finish();
      }
    }
  };

  return {
    source: "systemAudio",
    stop: () => {
      void stopAndTranscribe();
    },
    abort: () => {
      if (ended || aborted) {
        return;
      }
      aborted = true;
      recorder.abort();
      finish();
    },
  };
}

async function startSystemAudioRecorder(onAudioLevel: DictationAudioLevelHandler): Promise<{
  stop: () => Promise<Uint8Array>;
  abort: () => void;
}> {
  const AudioContextConstructor = resolveComposerAudioContextConstructor(globalThis);
  if (navigator.mediaDevices?.getUserMedia === undefined || AudioContextConstructor === null) {
    throw new Error("Audio recording is not available in this environment.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (error) {
    throw createMicrophonePermissionError(error);
  }

  const audioContext = new AudioContextConstructor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(DICTATION_CHUNK_SIZE, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    chunks.push(copy);
    event.outputBuffer.getChannelData(0).fill(0);
    onAudioLevel(calculateFloatAudioLevel(copy));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    onAudioLevel(0);
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await Promise.resolve(audioContext.close()).catch(() => undefined);
  };

  return {
    stop: async () => {
      await cleanup();
      const samples = mergeFloatChunks(chunks);
      return encodePcm16Wav(
        padShortRecording(
          resampleFloatSamples(samples, audioContext.sampleRate, DICTATION_TARGET_SAMPLE_RATE),
          DICTATION_MIN_SAMPLE_COUNT,
        ),
        DICTATION_TARGET_SAMPLE_RATE,
      );
    },
    abort: () => {
      void cleanup();
    },
  };
}

async function transcribeDictationAudio(args: {
  readonly audioBase64: string;
  readonly locale: string;
}): Promise<string> {
  if (testTranscriber !== null) {
    return testTranscriber(args);
  }
  const output = await invoke<unknown>("app_transcribe_dictation_audio", {
    input: {
      audioBase64: args.audioBase64,
      locale: args.locale,
    },
  });
  if (typeof output === "object" && output !== null && "text" in output) {
    const text = (output as { readonly text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function mergeFloatChunks(chunks: ReadonlyArray<Float32Array>): Float32Array {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(sampleCount);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

function resampleFloatSamples(samples: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (samples.length === 0 || inputSampleRate <= 0 || inputSampleRate === outputSampleRate) {
    return samples;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const fraction = sourceIndex - leftIndex;
    output[index] = samples[leftIndex] + (samples[rightIndex] - samples[leftIndex]) * fraction;
  }
  return output;
}

function padShortRecording(samples: Float32Array, minimumSampleCount: number): Float32Array {
  if (samples.length === 0 || samples.length >= minimumSampleCount) {
    return samples;
  }
  const padded = new Float32Array(minimumSampleCount);
  padded.set(samples);
  return padded;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataByteLength = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTE_LENGTH + dataByteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = WAV_HEADER_BYTE_LENGTH;
  samples.forEach((sample) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  });
  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function calculateFloatAudioLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let squareTotal = 0;
  samples.forEach((sample) => {
    squareTotal += sample * sample;
  });
  const rms = Math.sqrt(squareTotal / samples.length);
  return Math.max(0, Math.min(1, (rms - 0.01) * 8));
}

function resolveComposerAudioContextConstructor(scope: unknown): ComposerAudioContextConstructor | null {
  const candidate = scope as AudioContextGlobal | null | undefined;
  return candidate?.AudioContext ?? candidate?.webkitAudioContext ?? null;
}

function resolveDictationLanguage(locale: Locale): string {
  if (locale === "zh-CN") {
    return "zh-CN";
  }
  const browserLanguages = navigator.languages;
  if (Array.isArray(browserLanguages) && browserLanguages.some((language) => language.toLowerCase().startsWith("zh"))) {
    return "zh-CN";
  }
  return "en-US";
}

function createMicrophonePermissionError(cause: unknown): Error {
  if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")) {
    const error = new Error("Microphone permission was denied.");
    error.name = DICTATION_PERMISSION_DENIED_ERROR;
    error.cause = cause;
    return error;
  }
  if (cause instanceof Error && /denied|permission|notallowed/i.test(`${cause.name} ${cause.message}`)) {
    const error = new Error("Microphone permission was denied.");
    error.name = DICTATION_PERMISSION_DENIED_ERROR;
    error.cause = cause;
    return error;
  }
  return cause instanceof Error ? cause : new Error(String(cause));
}

function endsWithCjk(value: string): boolean {
  return /[\u3400-\u9fff]$/.test(value);
}

function startsWithCjk(value: string): boolean {
  return /^[\u3400-\u9fff]/.test(value);
}
