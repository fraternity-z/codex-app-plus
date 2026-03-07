import type { ConversationTextDelta } from "../domain/conversation";

const DEFAULT_FALLBACK_INTERVAL_MS = 16;

interface FrameTextDeltaQueueOptions {
  readonly onFlush: (entries: ReadonlyArray<ConversationTextDelta>) => void;
  readonly fallbackIntervalMs?: number;
}

function buildTargetKey(entry: ConversationTextDelta): string {
  if (entry.target.type === "agentMessage" || entry.target.type === "plan") {
    return entry.target.type;
  }
  if (entry.target.type === "reasoningSummary") {
    return `${entry.target.type}:${entry.target.summaryIndex}`;
  }
  return `${entry.target.type}:${entry.target.contentIndex}`;
}

function buildEntryKey(entry: ConversationTextDelta): string {
  return `${entry.conversationId}:${entry.turnId ?? "null"}:${entry.itemId}:${buildTargetKey(entry)}`;
}

export class FrameTextDeltaQueue {
  readonly #buffers = new Map<string, ConversationTextDelta>();
  readonly #onFlush: (entries: ReadonlyArray<ConversationTextDelta>) => void;
  readonly #fallbackIntervalMs: number;
  #flushHandle: number | ReturnType<typeof setTimeout> | null = null;
  #scheduler: "animationFrame" | "timeout" | null = null;

  constructor(options: FrameTextDeltaQueueOptions) {
    this.#onFlush = options.onFlush;
    this.#fallbackIntervalMs = options.fallbackIntervalMs ?? DEFAULT_FALLBACK_INTERVAL_MS;
  }

  enqueue(entry: ConversationTextDelta): void {
    const key = buildEntryKey(entry);
    const existing = this.#buffers.get(key);
    this.#buffers.set(key, { ...entry, delta: `${existing?.delta ?? ""}${entry.delta}` });
    this.#scheduleFlush();
  }

  flushNow(): void {
    this.#cancelScheduledFlush();
    if (this.#buffers.size === 0) {
      return;
    }
    const pending = [...this.#buffers.values()];
    this.#buffers.clear();
    this.#onFlush(pending);
  }

  #scheduleFlush(): void {
    if (this.#flushHandle !== null) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" && (typeof document === "undefined" || document.visibilityState === "visible")) {
      this.#scheduler = "animationFrame";
      this.#flushHandle = window.requestAnimationFrame(() => {
        this.#flushHandle = null;
        this.#scheduler = null;
        this.flushNow();
      });
      return;
    }
    this.#scheduler = "timeout";
    this.#flushHandle = setTimeout(() => {
      this.#flushHandle = null;
      this.#scheduler = null;
      this.flushNow();
    }, this.#fallbackIntervalMs);
  }

  #cancelScheduledFlush(): void {
    if (this.#flushHandle === null) {
      return;
    }
    if (this.#scheduler === "animationFrame" && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(this.#flushHandle as number);
    }
    if (this.#scheduler === "timeout") {
      clearTimeout(this.#flushHandle as ReturnType<typeof setTimeout>);
    }
    this.#flushHandle = null;
    this.#scheduler = null;
  }
}
