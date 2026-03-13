import type { ConversationOutputDelta } from "../../../domain/conversation";

const DEFAULT_FLUSH_INTERVAL_MS = 32;

interface OutputDeltaQueueOptions {
  readonly onFlush: (entries: ReadonlyArray<ConversationOutputDelta>) => void;
  readonly flushIntervalMs?: number;
}

function buildEntryKey(entry: ConversationOutputDelta): string {
  return `${entry.conversationId}:${entry.turnId ?? "null"}:${entry.itemId}:${entry.target}`;
}

export class OutputDeltaQueue {
  readonly #buffers = new Map<string, ConversationOutputDelta>();
  readonly #onFlush: (entries: ReadonlyArray<ConversationOutputDelta>) => void;
  readonly #flushIntervalMs: number;
  #flushHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(options: OutputDeltaQueueOptions) {
    this.#onFlush = options.onFlush;
    this.#flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  enqueue(entry: ConversationOutputDelta): void {
    const key = buildEntryKey(entry);
    const existing = this.#buffers.get(key);
    this.#buffers.set(key, { ...entry, delta: `${existing?.delta ?? ""}${entry.delta}` });
    this.#scheduleFlush();
  }

  flushNow(): void {
    if (this.#buffers.size === 0) {
      return;
    }
    if (this.#flushHandle !== null) {
      clearTimeout(this.#flushHandle);
      this.#flushHandle = null;
    }
    const pending = [...this.#buffers.values()];
    this.#buffers.clear();
    this.#onFlush(pending);
  }

  #scheduleFlush(): void {
    if (this.#flushHandle !== null) {
      return;
    }
    this.#flushHandle = setTimeout(() => {
      this.#flushHandle = null;
      this.flushNow();
    }, this.#flushIntervalMs);
  }
}
