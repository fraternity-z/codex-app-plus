type CleanupTask = () => Promise<void>;

interface ScheduledCleanup {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly generation: number;
}

const DEFAULT_MAX_CONCURRENT_CLEANUPS = 3;

export class ThreadLifecycleCoordinator {
  private readonly cleanupPromises = new Map<string, Promise<void>>();
  private readonly resumeCounts = new Map<string, number>();
  private readonly activeCounts = new Map<string, number>();
  private readonly scheduledCleanups = new Map<string, ScheduledCleanup>();
  private readonly generations = new Map<string, number>();
  private readonly cleanupQueue: Array<() => void> = [];
  private runningCleanups = 0;

  constructor(private readonly maxConcurrentCleanups = DEFAULT_MAX_CONCURRENT_CLEANUPS) {}

  noteThreadActivity(threadId: string): void {
    this.cancelScheduledCleanup(threadId);
  }

  scheduleCleanup(threadId: string, delayMs: number, cleanup: CleanupTask): void {
    if (this.scheduledCleanups.has(threadId)) {
      return;
    }
    const generation = this.bumpGeneration(threadId);
    const timer = setTimeout(() => {
      const scheduled = this.scheduledCleanups.get(threadId);
      if (scheduled?.generation !== generation) {
        return;
      }
      this.scheduledCleanups.delete(threadId);
      void cleanup();
    }, delayMs);
    this.scheduledCleanups.set(threadId, { timer, generation });
  }

  async prepareForThreadUse(threadId: string): Promise<void> {
    this.cancelScheduledCleanup(threadId);
    await this.cleanupPromises.get(threadId);
  }

  async runWithResume<T>(threadId: string, action: () => Promise<T>): Promise<T> {
    await this.prepareForThreadUse(threadId);
    this.increment(this.resumeCounts, threadId);
    try {
      return await action();
    } finally {
      this.decrement(this.resumeCounts, threadId);
    }
  }

  async runWithActivity<T>(threadId: string, action: () => Promise<T>): Promise<T> {
    await this.prepareForThreadUse(threadId);
    this.increment(this.activeCounts, threadId);
    try {
      return await action();
    } finally {
      this.decrement(this.activeCounts, threadId);
    }
  }

  async runCleanup(
    threadId: string,
    cleanup: CleanupTask,
    options: { readonly force?: boolean } = {},
  ): Promise<boolean> {
    this.cancelScheduledCleanup(threadId);
    if (this.cleanupPromises.has(threadId)) {
      return false;
    }
    if (options.force !== true && (this.hasCount(this.resumeCounts, threadId) || this.hasCount(this.activeCounts, threadId))) {
      return false;
    }

    let didRun = false;
    let cleanupPromise!: Promise<void>;
    cleanupPromise = (async () => {
      const release = await this.acquireCleanupSlot();
      try {
        if (options.force !== true && (this.hasCount(this.resumeCounts, threadId) || this.hasCount(this.activeCounts, threadId))) {
          return;
        }
        didRun = true;
        await cleanup();
      } finally {
        release();
        if (this.cleanupPromises.get(threadId) === cleanupPromise) {
          this.cleanupPromises.delete(threadId);
        }
      }
    })();
    this.cleanupPromises.set(threadId, cleanupPromise);
    await cleanupPromise;
    return didRun;
  }

  cancelScheduledCleanup(threadId: string): void {
    const scheduled = this.scheduledCleanups.get(threadId);
    if (scheduled !== undefined) {
      clearTimeout(scheduled.timer);
      this.scheduledCleanups.delete(threadId);
    }
    this.bumpGeneration(threadId);
  }

  dispose(): void {
    for (const scheduled of this.scheduledCleanups.values()) {
      clearTimeout(scheduled.timer);
    }
    this.scheduledCleanups.clear();
    this.cleanupQueue.splice(0);
  }

  private async acquireCleanupSlot(): Promise<() => void> {
    if (this.runningCleanups < this.maxConcurrentCleanups) {
      this.runningCleanups += 1;
      return () => this.releaseCleanupSlot();
    }
    await new Promise<void>((resolve) => {
      this.cleanupQueue.push(resolve);
    });
    this.runningCleanups += 1;
    return () => this.releaseCleanupSlot();
  }

  private releaseCleanupSlot(): void {
    this.runningCleanups = Math.max(0, this.runningCleanups - 1);
    const next = this.cleanupQueue.shift();
    if (next !== undefined) {
      next();
    }
  }

  private bumpGeneration(threadId: string): number {
    const next = (this.generations.get(threadId) ?? 0) + 1;
    this.generations.set(threadId, next);
    return next;
  }

  private increment(counts: Map<string, number>, threadId: string): void {
    counts.set(threadId, (counts.get(threadId) ?? 0) + 1);
  }

  private decrement(counts: Map<string, number>, threadId: string): void {
    const next = (counts.get(threadId) ?? 0) - 1;
    if (next <= 0) {
      counts.delete(threadId);
      return;
    }
    counts.set(threadId, next);
  }

  private hasCount(counts: Map<string, number>, threadId: string): boolean {
    return (counts.get(threadId) ?? 0) > 0;
  }
}
