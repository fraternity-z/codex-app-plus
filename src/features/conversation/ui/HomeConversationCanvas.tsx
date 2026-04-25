import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type {
  ConnectionStatus,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
} from "../../../domain/types";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import type { ConversationMessage } from "../../../domain/timeline";
import type { ConnectionRetryInfo } from "../../home/model/homeConnectionRetry";
import { useI18n } from "../../../i18n";
import {
  flattenConversationRenderGroup,
  splitActivitiesIntoRenderGroups,
} from "../model/localConversationGroups";
import { classifyCommand } from "../model/commandIntent";
import { HomeConnectionStatusToast } from "../../home/ui/HomeConnectionStatusToast";
import { HomeChatMessageActions } from "./HomeChatMessage";
import { HomeTimelineEntry } from "./HomeTimelineEntry";
import { HomeTurnThinkingIndicator } from "./HomeTurnThinkingIndicator";

const INITIAL_VIEWPORT_HEIGHT = 720;
const GROUP_ESTIMATED_HEIGHT = 260;
const GROUP_OVERSCAN = 6;

interface HomeConversationCanvasProps {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly selectedThread: ThreadSummary | null;
  readonly activeTurnId: string | null;
  readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly placeholder: { readonly title: string; readonly body: string } | null;
  readonly onResolveServerRequest: (
    resolution: ServerRequestResolution,
  ) => Promise<void>;
  readonly connectionStatus: ConnectionStatus;
  readonly connectionRetryInfo: ConnectionRetryInfo | null;
  readonly fatalError: string | null;
  readonly retryScheduledAt: number | null;
  readonly busy: boolean;
  readonly onRetryConnection: () => Promise<void>;
  readonly canEditMessages?: boolean;
  readonly onEditUserMessage?: (message: ConversationMessage, text: string) => Promise<void>;
}

interface RenderGroup {
  readonly key: string;
  readonly nodes: ReturnType<typeof flattenConversationRenderGroup>;
  readonly showThinkingIndicator: boolean;
  readonly turnStatus: TurnStatus | null;
}

type AssistantFlowRenderNode = Exclude<RenderGroup["nodes"][number], { readonly kind: "userBubble" }>;
type AssistantTraceNode = Extract<AssistantFlowRenderNode, { readonly kind: "traceItem" }>;
type AssistantDisplayNode =
  | AssistantFlowRenderNode
  | {
    readonly key: string;
    readonly kind: "assistantToolGroup";
    readonly nodes: ReadonlyArray<AssistantTraceNode>;
  };

function useMeasuredRenderGroups(groups: ReadonlyArray<RenderGroup>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nodeByKeyRef = useRef(new Map<string, HTMLDivElement>());
  const observerByKeyRef = useRef(new Map<string, ResizeObserver>());
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getItemKey: (index) => groups[index]?.key ?? String(index),
    getScrollElement: () => scrollRef.current,
    initialRect: { width: 0, height: INITIAL_VIEWPORT_HEIGHT },
    estimateSize: () => GROUP_ESTIMATED_HEIGHT,
    overscan: GROUP_OVERSCAN,
  });

  const setGroupRef = useCallback((key: string, node: HTMLDivElement | null) => {
    const previousNode = nodeByKeyRef.current.get(key) ?? null;
    if (previousNode !== null && previousNode !== node) {
      observerByKeyRef.current.get(key)?.disconnect();
      observerByKeyRef.current.delete(key);
      nodeByKeyRef.current.delete(key);
    }
    if (node === null) {
      return;
    }
    nodeByKeyRef.current.set(key, node);
    rowVirtualizer.measureElement(node);
    if (observerByKeyRef.current.has(key)) {
      return;
    }
    const observer = new ResizeObserver(() => {
      rowVirtualizer.measureElement(node);
    });
    observer.observe(node);
    observerByKeyRef.current.set(key, observer);
  }, [rowVirtualizer]);

  useEffect(() => () => {
    for (const observer of observerByKeyRef.current.values()) {
      observer.disconnect();
    }
    observerByKeyRef.current.clear();
    nodeByKeyRef.current.clear();
  }, []);

  return { rowVirtualizer, scrollRef, setGroupRef };
}

export function HomeConversationCanvas(
  props: HomeConversationCanvasProps,
): JSX.Element {
  const { t } = useI18n();
  const renderGroups = useMemo(
    () => createRenderGroups(
      props.activities,
      props.activeTurnId,
      props.turnStatuses ?? {},
      props.threadDetailLevel,
    ),
    [props.activities, props.activeTurnId, props.turnStatuses, props.threadDetailLevel],
  );
  const scrollKey = useMemo(() => createScrollKey(renderGroups), [renderGroups]);
  const { rowVirtualizer, scrollRef, setGroupRef } = useMeasuredRenderGroups(
    renderGroups,
  );
  const copyTimeoutRef = useRef<number | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopyText = useCallback(async (copyId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(copyId);
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId(null);
      }, 1200);
    } catch {
      // Clipboard writes can fail in restricted browser contexts.
    }
  }, []);

  const handleCopyMessage = useCallback((message: ConversationMessage) => (
    handleCopyText(message.id, message.text)
  ), [handleCopyText]);

  const handleEditUserMessage = useCallback((message: ConversationMessage, text: string) => (
    props.onEditUserMessage?.(message, text) ?? Promise.resolve()
  ), [props.onEditUserMessage]);

  useEffect(() => () => {
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null || renderGroups.length === 0) {
      return;
    }
    rowVirtualizer.scrollToIndex(renderGroups.length - 1, { align: "end" });
    element.scrollTop = element.scrollHeight;
  }, [renderGroups.length, rowVirtualizer, scrollKey]);

  return (
    <main className="home-conversation" aria-label="会话内容">
      <div ref={scrollRef} className="home-conversation-scroll">
        {renderGroups.length === 0 ? (
          <div className="home-conversation-thread">
            <ConversationPlaceholder placeholder={props.placeholder} />
          </div>
        ) : (
          <div
            className="home-conversation-thread home-conversation-thread-virtual"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const group = renderGroups[virtualRow.index];
              if (group === undefined) {
                return null;
              }
              const userNodes = group.nodes.filter((node) => node.kind === "userBubble");
              const assistantNodes = group.nodes.filter((node): node is AssistantFlowRenderNode => node.kind !== "userBubble");
              const assistantDisplayNodes = createAssistantDisplayNodes(
                assistantNodes,
                group.turnStatus,
                group.showThinkingIndicator,
              );
              const assistantCopyText = createAssistantCopyText(group.nodes);
              const assistantCopyId = `assistant:${group.key}`;
              return (
                <div
                  key={group.key}
                  className="home-conversation-row"
                  data-index={virtualRow.index}
                  ref={(node) => setGroupRef(group.key, node)}
                  style={{ transform: `translate3d(0, ${virtualRow.start}px, 0)` }}
                >
                  <section className="home-turn-group">
                    {userNodes.map((node) => (
                      <HomeTimelineEntry
                        key={node.key}
                        node={node}
                        turnStatus={group.turnStatus}
                        onResolveServerRequest={props.onResolveServerRequest}
                        copiedMessageId={copiedMessageId}
                        canEditMessages={props.canEditMessages === true && props.onEditUserMessage !== undefined}
                        onCopyMessage={(message) => void handleCopyMessage(message)}
                        onEditUserMessage={handleEditUserMessage}
                      />
                    ))}
                    {assistantNodes.length > 0 || group.showThinkingIndicator ? (
                      <div className="home-turn-assistant-flow">
                        {assistantDisplayNodes.map((node) => renderAssistantDisplayNode({
                          node,
                          turnStatus: group.turnStatus,
                          onResolveServerRequest: props.onResolveServerRequest,
                          copiedMessageId,
                          onCopyMessage: (message) => void handleCopyMessage(message),
                          onEditUserMessage: handleEditUserMessage,
                        }))}
                        {assistantCopyText !== null ? (
                          <HomeChatMessageActions
                            assistant
                            copied={copiedMessageId === assistantCopyId}
                            canEdit={false}
                            labels={{
                              copy: t("app.conversation.copyMessage"),
                              copied: t("app.conversation.messageCopied"),
                              edit: t("app.conversation.editMessage"),
                            }}
                            onCopy={() => void handleCopyText(assistantCopyId, assistantCopyText)}
                          />
                        ) : null}
                        {group.showThinkingIndicator ? <HomeTurnThinkingIndicator /> : null}
                      </div>
                    ) : null}
                  </section>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <HomeConnectionStatusToast
        connectionStatus={props.connectionStatus}
        retryInfo={props.connectionRetryInfo}
        fatalError={props.fatalError}
        retryScheduledAt={props.retryScheduledAt}
        busy={props.busy}
        onRetryConnection={props.onRetryConnection}
      />
    </main>
  );
}

function renderAssistantDisplayNode(props: {
  readonly node: AssistantDisplayNode;
  readonly turnStatus: TurnStatus | null;
  readonly onResolveServerRequest: HomeConversationCanvasProps["onResolveServerRequest"];
  readonly copiedMessageId: string | null;
  readonly onCopyMessage: (message: ConversationMessage) => void;
  readonly onEditUserMessage: (message: ConversationMessage, text: string) => Promise<void>;
}): JSX.Element {
  if (props.node.kind === "assistantToolGroup") {
    return (
      <HomeAssistantToolGroup
        key={props.node.key}
        node={props.node}
        turnStatus={props.turnStatus}
        onResolveServerRequest={props.onResolveServerRequest}
        copiedMessageId={props.copiedMessageId}
        onCopyMessage={props.onCopyMessage}
        onEditUserMessage={props.onEditUserMessage}
      />
    );
  }

  return (
    <HomeTimelineEntry
      key={props.node.key}
      node={props.node}
      turnStatus={props.turnStatus}
      onResolveServerRequest={props.onResolveServerRequest}
      copiedMessageId={props.copiedMessageId}
      canEditMessages={false}
      onCopyMessage={props.onCopyMessage}
      onEditUserMessage={props.onEditUserMessage}
    />
  );
}

function HomeAssistantToolGroup(props: {
  readonly node: Extract<AssistantDisplayNode, { readonly kind: "assistantToolGroup" }>;
  readonly turnStatus: TurnStatus | null;
  readonly onResolveServerRequest: HomeConversationCanvasProps["onResolveServerRequest"];
  readonly copiedMessageId: string | null;
  readonly onCopyMessage: (message: ConversationMessage) => void;
  readonly onEditUserMessage: (message: ConversationMessage, text: string) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <section className="home-assistant-transcript-entry home-assistant-transcript-tool-group">
      <details>
        <summary className="home-assistant-transcript-line home-assistant-transcript-summary home-assistant-transcript-tool-group-summary">
          <span className="home-assistant-transcript-tool-group-summary-text">
            {createAssistantToolGroupSummary(props.node.nodes, t)}
          </span>
          <span className="home-assistant-transcript-tool-group-chevron" aria-hidden="true" />
        </summary>
        <div className="home-assistant-transcript-tool-group-body">
          {props.node.nodes.map((node) => (
            <HomeTimelineEntry
              key={node.key}
              node={node}
              turnStatus={props.turnStatus}
              onResolveServerRequest={props.onResolveServerRequest}
              copiedMessageId={props.copiedMessageId}
              canEditMessages={false}
              onCopyMessage={props.onCopyMessage}
              onEditUserMessage={props.onEditUserMessage}
            />
          ))}
        </div>
      </details>
    </section>
  );
}

function createRenderGroups(
  activities: ReadonlyArray<TimelineEntry>,
  activeTurnId: string | null,
  turnStatuses: Readonly<Record<string, TurnStatus>>,
  threadDetailLevel: ThreadDetailLevel,
): Array<RenderGroup> {
  return splitActivitiesIntoRenderGroups(activities, activeTurnId, threadDetailLevel)
    .map((group) => ({
      key: group.key,
      nodes: flattenConversationRenderGroup(group),
      showThinkingIndicator: group.showThinkingIndicator,
      turnStatus: group.turnId === null ? null : turnStatuses[group.turnId] ?? null,
    }))
    .filter((group) => group.nodes.length > 0 || group.showThinkingIndicator);
}

function createAssistantDisplayNodes(
  nodes: ReadonlyArray<AssistantFlowRenderNode>,
  turnStatus: TurnStatus | null,
  showThinkingIndicator: boolean,
): Array<AssistantDisplayNode> {
  if (!shouldFoldAssistantToolGroups(nodes, turnStatus, showThinkingIndicator)) {
    return [...nodes];
  }

  const hasAssistantTextBefore = createAssistantTextBeforeMap(nodes);
  const hasAssistantTextAfter = createAssistantTextAfterMap(nodes);
  const displayNodes: Array<AssistantDisplayNode> = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];
    if (
      node !== undefined
      && isFoldableTraceNode(node)
      && hasAssistantTextBefore[index] === true
      && hasAssistantTextAfter[index] === true
    ) {
      const run: Array<AssistantTraceNode> = [];
      let cursor = index;
      while (cursor < nodes.length) {
        const runNode = nodes[cursor];
        if (
          !isFoldableTraceNode(runNode)
          || hasAssistantTextBefore[cursor] !== true
          || hasAssistantTextAfter[cursor] !== true
        ) {
          break;
        }
        run.push(runNode);
        cursor += 1;
      }

      if (shouldCreateAssistantToolGroup(run)) {
        displayNodes.push({
          key: `tool-group:${run.map((entry) => entry.key).join(":")}`,
          kind: "assistantToolGroup",
          nodes: run,
        });
      } else {
        displayNodes.push(...run);
      }
      index = cursor;
      continue;
    }

    if (node !== undefined) {
      displayNodes.push(node);
    }
    index += 1;
  }

  return displayNodes;
}

function shouldFoldAssistantToolGroups(
  nodes: ReadonlyArray<AssistantFlowRenderNode>,
  turnStatus: TurnStatus | null,
  showThinkingIndicator: boolean,
): boolean {
  const streamStillActive = turnStatus === "inProgress" || (turnStatus === null && showThinkingIndicator);
  return streamStillActive === false
    && nodes.every((node) => node.kind !== "assistantMessage" || node.message.status !== "streaming");
}

function createAssistantTextBeforeMap(nodes: ReadonlyArray<AssistantFlowRenderNode>): ReadonlyArray<boolean> {
  const result: boolean[] = [];
  let hasText = false;
  for (let index = 0; index < nodes.length; index += 1) {
    result[index] = hasText;
    if (isAssistantTextNode(nodes[index])) {
      hasText = true;
    }
  }
  return result;
}

function createAssistantTextAfterMap(nodes: ReadonlyArray<AssistantFlowRenderNode>): ReadonlyArray<boolean> {
  const result: boolean[] = [];
  let hasText = false;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    result[index] = hasText;
    if (isAssistantTextNode(nodes[index])) {
      hasText = true;
    }
  }
  return result;
}

function isAssistantTextNode(node: AssistantFlowRenderNode | undefined): boolean {
  return node?.kind === "assistantMessage" && node.message.text.trim().length > 0;
}

function isFoldableTraceNode(node: AssistantFlowRenderNode | undefined): node is AssistantTraceNode {
  if (node?.kind !== "traceItem") {
    return false;
  }
  return node.item.kind === "commandExecution"
    || node.item.kind === "fileChange"
    || node.item.kind === "mcpToolCall"
    || node.item.kind === "dynamicToolCall"
    || node.item.kind === "collabAgentToolCall"
    || node.item.kind === "webSearch";
}

function shouldCreateAssistantToolGroup(nodes: ReadonlyArray<AssistantTraceNode>): boolean {
  if (nodes.length > 1) {
    return true;
  }

  const node = nodes[0];
  if (node?.item.kind === "fileChange") {
    return countEditedFiles(nodes) > 1;
  }
  if (node?.item.kind === "commandExecution") {
    return countReadFiles(nodes) > 1;
  }
  return false;
}

function createAssistantToolGroupSummary(
  nodes: ReadonlyArray<AssistantTraceNode>,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const editedFileCount = countEditedFiles(nodes);
  if (editedFileCount > 0 && nodes.every((node) => node.item.kind === "fileChange")) {
    return t("home.conversation.transcript.toolGroupEditedFiles", { count: String(editedFileCount) });
  }

  const readFileCount = countReadFiles(nodes);
  if (readFileCount > 0 && nodes.every((node) => node.item.kind === "commandExecution" && getCommandReadPaths(node.item.command).length > 0)) {
    return t("home.conversation.transcript.toolGroupReadFiles", { count: String(readFileCount) });
  }

  const commandCount = nodes.filter((node) => node.item.kind === "commandExecution").length;
  if (commandCount === nodes.length) {
    return t("home.conversation.transcript.toolGroupCommands", { count: String(commandCount) });
  }

  const fileChangeNodeCount = nodes.filter((node) => node.item.kind === "fileChange").length;
  const otherToolCount = nodes.length - commandCount - fileChangeNodeCount;
  const parts = [
    editedFileCount > 0
      ? t("home.conversation.transcript.toolGroupEditedFiles", { count: String(editedFileCount) })
      : null,
    commandCount > 0
      ? t("home.conversation.transcript.toolGroupCommands", { count: String(commandCount) })
      : null,
    otherToolCount > 0
      ? t("home.conversation.transcript.toolGroupTools", { count: String(otherToolCount) })
      : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0
    ? parts.join(t("home.conversation.transcript.toolGroupSeparator"))
    : t("home.conversation.transcript.toolGroupTools", { count: String(nodes.length) });
}

function countEditedFiles(nodes: ReadonlyArray<AssistantTraceNode>): number {
  const paths = new Set<string>();
  let fallbackCount = 0;
  for (const node of nodes) {
    if (node.item.kind !== "fileChange") {
      continue;
    }
    for (const change of node.item.changes) {
      const path = change.path.trim();
      if (path.length > 0) {
        paths.add(path);
      } else {
        fallbackCount += 1;
      }
    }
  }
  return paths.size + fallbackCount;
}

function countReadFiles(nodes: ReadonlyArray<AssistantTraceNode>): number {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.item.kind !== "commandExecution") {
      continue;
    }
    for (const path of getCommandReadPaths(node.item.command)) {
      paths.add(path);
    }
  }
  return paths.size;
}

function getCommandReadPaths(command: string): ReadonlyArray<string> {
  const intent = classifyCommand(command);
  if (intent?.kind === "readFile") {
    return [intent.path];
  }
  if (intent?.kind === "readFiles") {
    return intent.paths;
  }
  return [];
}

function createAssistantCopyText(nodes: ReadonlyArray<RenderGroup["nodes"][number]>): string | null {
  const parts = nodes
    .filter((node): node is Extract<RenderGroup["nodes"][number], { kind: "assistantMessage" }> => node.kind === "assistantMessage")
    .map((node) => node.message.text.trim())
    .filter((text) => text.length > 0);

  return parts.length === 0 ? null : parts.join("\n\n");
}

function createScrollKey(groups: ReadonlyArray<RenderGroup>): string {
  const lastGroup = groups[groups.length - 1];
  if (!lastGroup) {
    return "empty";
  }

  return `${createLastNodeScrollKey(lastGroup.nodes)}:${lastGroup.showThinkingIndicator ? "thinking" : "idle"}`;
}

function createLastNodeScrollKey(
  nodes: ReadonlyArray<RenderGroup["nodes"][number]>,
): string {
  const lastNode = nodes[nodes.length - 1];
  if (!lastNode) {
    return "empty";
  }

  if (lastNode.kind === "userBubble") {
    return `${lastNode.key}:${lastNode.message.status}:${lastNode.message.text.length}`;
  }
  if (lastNode.kind === "assistantMessage") {
    return `${lastNode.key}:${lastNode.message.status}:${lastNode.message.text.length}`;
  }
  if (lastNode.kind === "reasoningBlock") {
    return `${lastNode.key}:${lastNode.block.titleMarkdown.length}:${lastNode.block.bodyMarkdown.length}`;
  }
  if (lastNode.kind === "traceItem") {
    return createTraceScrollKey(lastNode);
  }
  return lastNode.key;
}

function createTraceScrollKey(
  node: Extract<RenderGroup["nodes"][number], { kind: "traceItem" }>,
): string {
  if (node.item.kind === "commandExecution") {
    return `${node.key}:${node.item.status}:${node.item.output.length}`;
  }
  if (node.item.kind === "fileChange") {
    return `${node.key}:${node.item.status}:${node.item.output.length}:${node.item.changes.length}`;
  }
  if (node.item.kind === "mcpToolCall") {
    return `${node.key}:${node.item.status}:${getMcpToolResultSignature(node.item.result)}:${node.item.progress.length}`;
  }
  if (node.item.kind === "dynamicToolCall") {
    return `${node.key}:${node.item.status}:${node.item.contentItems.length}`;
  }
  if (node.item.kind === "collabAgentToolCall") {
    return `${node.key}:${node.item.status}:${Object.keys(node.item.agentsStates).length}`;
  }
  if (node.item.kind === "webSearch") {
    return `${node.key}:${node.item.query}:${node.item.action?.type ?? "none"}`;
  }
  if (node.item.kind === "imageGeneration") {
    return `${node.key}:${node.item.status}:${node.item.savedPath ?? "none"}:${node.item.result.length}`;
  }
  return `${node.key}:${node.item.path}`;
}

function getMcpToolResultSignature(result: unknown): string {
  if (result === null || result === undefined) {
    return "null";
  }
  if (Array.isArray(result)) {
    return `array:${result.length}`;
  }
  if (typeof result === "string") {
    return `string:${result.length}`;
  }
  if (typeof result === "number") {
    return "number";
  }
  if (typeof result === "boolean") {
    return "boolean";
  }
  if (typeof result === "object") {
    return `object:${Object.keys(result).length}`;
  }
  return "other";
}

function ConversationPlaceholder(props: {
  readonly placeholder: HomeConversationCanvasProps["placeholder"];
}): JSX.Element {
  if (props.placeholder !== null) {
    return (
      <div className="home-chat-placeholder">
        <p className="home-chat-placeholder-title">{props.placeholder.title}</p>
        <p className="home-chat-placeholder-body">{props.placeholder.body}</p>
      </div>
    );
  }

  return (
    <div className="home-chat-placeholder">
      <p className="home-chat-placeholder-title">Thread ready</p>
      <p className="home-chat-placeholder-body">
        Your turns, tools, approvals, plans, realtime events, and file changes appear here.
      </p>
    </div>
  );
}
