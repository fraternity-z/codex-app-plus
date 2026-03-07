import type { ThreadStartResponse } from "../protocol/generated/v2/ThreadStartResponse";

interface PrewarmedEntry {
  readonly promise: Promise<ThreadStartResponse | null>;
  readonly threadId: string | null;
}

const prewarmedByWorkspace = new Map<string, PrewarmedEntry>();
const prewarmedThreadIds = new Set<string>();

export function hasPrewarmedThread(workspacePath: string): boolean {
  return prewarmedByWorkspace.has(workspacePath);
}

export function registerPrewarmedThreadPromise(workspacePath: string, promise: Promise<ThreadStartResponse | null>): void {
  prewarmedByWorkspace.set(workspacePath, { promise, threadId: null });
  void promise.then((response) => {
    if (response === null) {
      prewarmedByWorkspace.delete(workspacePath);
      return;
    }
    prewarmedByWorkspace.set(workspacePath, { promise, threadId: response.thread.id });
    prewarmedThreadIds.add(response.thread.id);
  }).catch(() => {
    prewarmedByWorkspace.delete(workspacePath);
  });
}

export async function consumePrewarmedThread(workspacePath: string): Promise<ThreadStartResponse | null> {
  const entry = prewarmedByWorkspace.get(workspacePath);
  if (entry === undefined) {
    return null;
  }
  prewarmedByWorkspace.delete(workspacePath);
  const response = await entry.promise;
  if (response !== null) {
    prewarmedThreadIds.delete(response.thread.id);
  }
  return response;
}

export function clearPrewarmedThread(threadId: string): void {
  prewarmedThreadIds.delete(threadId);
}

export function isPrewarmedThread(threadId: string): boolean {
  return prewarmedThreadIds.has(threadId);
}
