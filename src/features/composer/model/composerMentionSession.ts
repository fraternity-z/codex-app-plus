import type { Dispatch, MutableRefObject } from "react";
import type { AppAction } from "../../../domain/types";
import { createComposerFuzzySessionId, type ComposerCommandBridge } from "../service/composerCommandBridge";

export interface MentionSessionRefs {
  readonly sessionIdRef: MutableRefObject<string | null>;
  readonly rootPathRef: MutableRefObject<string | null>;
  readonly syncedQueryRef: MutableRefObject<string | null>;
  readonly syncTokenRef: MutableRefObject<number>;
}

interface BaseContext {
  readonly composerCommandBridge: ComposerCommandBridge;
  readonly dispatch: Dispatch<AppAction>;
  readonly refs: MentionSessionRefs;
  readonly setMentionSessionId: (sessionId: string | null) => void;
}

export async function syncMentionSession(
  context: BaseContext & {
    readonly rootPath: string;
    readonly query: string;
    readonly setPaletteError: (message: string | null) => void;
  },
): Promise<void> {
  const token = ++context.refs.syncTokenRef.current;

  try {
    await ensureMentionSession(context);
    if (token !== context.refs.syncTokenRef.current) {
      return;
    }
    if (context.refs.syncedQueryRef.current === context.query || context.refs.sessionIdRef.current === null) {
      context.setPaletteError(null);
      return;
    }
    await context.composerCommandBridge.updateFuzzySession({
      sessionId: context.refs.sessionIdRef.current,
      query: context.query,
    });
    if (token === context.refs.syncTokenRef.current) {
      context.refs.syncedQueryRef.current = context.query;
      context.setPaletteError(null);
    }
  } catch (error) {
    console.error("文件提及搜索失败", error);
    if (token === context.refs.syncTokenRef.current) {
      context.setPaletteError(error instanceof Error ? error.message : String(error));
    }
  }
}

export async function stopMentionSession(context: BaseContext): Promise<void> {
  const sessionId = context.refs.sessionIdRef.current;
  context.refs.sessionIdRef.current = null;
  context.refs.rootPathRef.current = null;
  context.refs.syncedQueryRef.current = null;
  context.setMentionSessionId(null);
  if (sessionId === null) {
    return;
  }
  context.dispatch({ type: "fuzzySearch/removed", sessionId });
  try {
    await context.composerCommandBridge.stopFuzzySession({ sessionId });
  } catch (error) {
    console.error("关闭文件提及搜索失败", error);
  }
}

async function ensureMentionSession(
  context: BaseContext & { readonly rootPath: string },
): Promise<void> {
  if (sessionMatchesRoot(context.refs, context.rootPath)) {
    return;
  }

  await stopMentionSession(context);
  const sessionId = createComposerFuzzySessionId();
  context.refs.sessionIdRef.current = sessionId;
  context.refs.rootPathRef.current = context.rootPath;
  context.refs.syncedQueryRef.current = null;
  context.setMentionSessionId(sessionId);
  await context.composerCommandBridge.startFuzzySession({ sessionId, roots: [context.rootPath] });
}

function sessionMatchesRoot(refs: MentionSessionRefs, rootPath: string): boolean {
  return refs.sessionIdRef.current !== null && refs.rootPathRef.current === rootPath;
}
