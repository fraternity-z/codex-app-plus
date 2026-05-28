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
import type { CollabAgentToolCallEntry, ConversationMessage } from "../../../domain/timeline";
import type { ConnectionRetryInfo } from "../../home/model/homeConnectionRetry";
import { useI18n } from "../../../i18n";
import {
  flattenConversationRenderGroup,
  splitActivitiesIntoRenderGroups,
} from "../model/localConversationGroups";
import { classifyCommand } from "../model/commandIntent";
import { HomeConnectionStatusToast } from "../../home/ui/HomeConnectionStatusToast";
import { HomeSubagentTranscriptEntry } from "./HomeAssistantTranscriptEntry";
import { HomeChatMessageActions } from "./HomeChatMessage";
import { HomeTimelineEntry } from "./HomeTimelineEntry";
import { HomeTurnThinkingIndicator } from "./HomeTurnThinkingIndicator";

const INITIAL_VIEWPORT_HEIGHT = 720;
const GROUP_ESTIMATED_HEIGHT = 260;
const GROUP_OVERSCAN = 6;
const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 120;

interface HomeConversationCanvasProps {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly selectedThread: ThreadSummary | null;
  readonly activeTurnId: string | null;
  readonly showProgress?: boolean;
  readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
  readonly threads?: ReadonlyArray<ThreadSummary>;
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
  readonly onSelectThread?: (threadId: string) => void;
}

interface RenderGroup {
  readonly key: string;
  readonly nodes: ReturnType<typeof flattenConversationRenderGroup>;
  readonly showThinkingIndicator: boolean;
  readonly progressFallback: boolean;
  readonly turnStatus: TurnStatus | null;
}

type AssistantFlowRenderNode = Exclude<RenderGroup["nodes"][number], { readonly kind: "userBubble" }>;
type AssistantTraceNode = Extract<AssistantFlowRenderNode, { readonly kind: "traceItem" }>;
type AssistantToolGroupSummaryIcon = "edit" | "terminal";

interface AssistantToolGroupSummaryPart {
  readonly icon: AssistantToolGroupSummaryIcon | null;
  readonly label: string;
}
type AssistantSubagentTraceNode = AssistantTraceNode & { readonly item: CollabAgentToolCallEntry };
type AssistantDisplayNode =
  | AssistantFlowRenderNode
  | {
    readonly key: string;
    readonly kind: "assistantToolGroup";
    readonly nodes: ReadonlyArray<AssistantTraceNode>;
  }
  | {
    readonly key: string;
    readonly kind: "assistantSubagentGroup";
    readonly nodes: ReadonlyArray<AssistantSubagentTraceNode>;
  };

function useMeasuredRenderGroups(groups: ReadonlyArray<RenderGroup>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nodeByKeyRef = useRef(new Map<string, HTMLDivElement>());
  const observerByKeyRef = useRef(new Map<string, ResizeObserver>());
  const pendingMeasureKeysRef = useRef(new Set<string>());
  const measureFrameRef = useRef<number | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getItemKey: (index) => groups[index]?.key ?? String(index),
    getScrollElement: () => scrollRef.current,
    initialRect: { width: 0, height: INITIAL_VIEWPORT_HEIGHT },
    initialOffset: () => Math.max(0, groups.length * GROUP_ESTIMATED_HEIGHT - INITIAL_VIEWPORT_HEIGHT),
    estimateSize: () => GROUP_ESTIMATED_HEIGHT,
    overscan: GROUP_OVERSCAN,
  });

  const flushPendingMeasurements = useCallback(() => {
    measureFrameRef.current = null;
    if (pendingMeasureKeysRef.current.size === 0) {
      return;
    }
    const pendingKeys = [...pendingMeasureKeysRef.current];
    pendingMeasureKeysRef.current.clear();
    for (const key of pendingKeys) {
      const node = nodeByKeyRef.current.get(key);
      if (node !== undefined) {
        rowVirtualizer.measureElement(node);
      }
    }
  }, [rowVirtualizer]);

  const scheduleMeasurement = useCallback((key: string) => {
    pendingMeasureKeysRef.current.add(key);
    if (measureFrameRef.current !== null) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      measureFrameRef.current = window.requestAnimationFrame(flushPendingMeasurements);
      return;
    }
    flushPendingMeasurements();
  }, [flushPendingMeasurements]);

  const setGroupRef = useCallback((key: string, node: HTMLDivElement | null) => {
    const previousNode = nodeByKeyRef.current.get(key) ?? null;
    if (previousNode !== null && previousNode !== node) {
      observerByKeyRef.current.get(key)?.disconnect();
      observerByKeyRef.current.delete(key);
      nodeByKeyRef.current.delete(key);
      pendingMeasureKeysRef.current.delete(key);
    }
    if (node === null) {
      return;
    }
    nodeByKeyRef.current.set(key, node);
    scheduleMeasurement(key);
    if (observerByKeyRef.current.has(key)) {
      return;
    }
    const observer = new ResizeObserver(() => {
      scheduleMeasurement(key);
    });
    observer.observe(node);
    observerByKeyRef.current.set(key, observer);
  }, [scheduleMeasurement]);

  useEffect(() => () => {
    if (measureFrameRef.current !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(measureFrameRef.current);
    }
    measureFrameRef.current = null;
    pendingMeasureKeysRef.current.clear();
    for (const observer of observerByKeyRef.current.values()) {
      observer.disconnect();
    }
    observerByKeyRef.current.clear();
    nodeByKeyRef.current.clear();
  }, []);

  return { rowVirtualizer, scrollRef, setGroupRef };
}

function isNearScrollBottom(element: HTMLElement): boolean {
  const distanceToBottom = element.scrollHeight - element.clientHeight - element.scrollTop;
  return distanceToBottom <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX;
}

export function HomeConversationCanvas(
  props: HomeConversationCanvasProps,
): JSX.Element {
  const { t } = useI18n();
  const renderGroups = useMemo(
    () => createRenderGroups(
      props.activities,
      props.activeTurnId,
      props.showProgress === true,
      props.turnStatuses ?? {},
      props.threadDetailLevel,
    ),
    [props.activities, props.activeTurnId, props.showProgress, props.turnStatuses, props.threadDetailLevel],
  );
  const scrollKey = useMemo(() => createScrollKey(renderGroups), [renderGroups]);
  const { rowVirtualizer, scrollRef, setGroupRef } = useMeasuredRenderGroups(
    renderGroups,
  );
  const shouldAutoFollowRef = useRef(true);
  const copyTimeoutRef = useRef<number | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const updateAutoFollowState = useCallback(() => {
    const element = scrollRef.current;
    if (element === null) {
      return;
    }
    shouldAutoFollowRef.current = isNearScrollBottom(element);
  }, [scrollRef]);

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
    shouldAutoFollowRef.current = true;
  }, [props.selectedThread?.id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null || renderGroups.length === 0) {
      return;
    }
    if (!shouldAutoFollowRef.current) {
      return;
    }
    rowVirtualizer.scrollToIndex(renderGroups.length - 1, { align: "end" });
    element.scrollTop = element.scrollHeight;
    updateAutoFollowState();
  }, [renderGroups.length, rowVirtualizer, scrollKey, updateAutoFollowState]);

  return (
    <main className="home-conversation" aria-label="会话内容">
      <div ref={scrollRef} className="home-conversation-scroll" onScroll={updateAutoFollowState}>
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
                group.progressFallback,
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
                        threads={props.threads}
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
                          threads: props.threads,
                          onSelectThread: props.onSelectThread,
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
  readonly threads?: ReadonlyArray<ThreadSummary>;
  readonly onSelectThread?: (threadId: string) => void;
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
  if (props.node.kind === "assistantSubagentGroup") {
    return (
      <HomeSubagentTranscriptEntry
        key={props.node.key}
        entries={props.node.nodes.map((node) => node.item)}
        threads={props.threads}
        onSelectThread={props.onSelectThread}
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
      threads={props.threads}
      onSelectThread={props.onSelectThread}
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
  const [expanded, setExpanded] = useState(false);
  const bodyNodes = useMemo(
    () => (expanded ? createAssistantToolGroupBodyNodes(props.node.nodes) : []),
    [expanded, props.node.nodes],
  );
  const summaryParts = createAssistantToolGroupSummaryParts(props.node.nodes, t);
  return (
    <section className="home-assistant-transcript-entry home-assistant-transcript-tool-group">
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className="home-assistant-transcript-line home-assistant-transcript-summary home-assistant-transcript-tool-group-summary">
          <AssistantToolGroupSummary parts={summaryParts} separator={t("home.conversation.transcript.toolGroupSeparator")} />
          <span className="home-assistant-transcript-tool-group-chevron" aria-hidden="true" />
        </summary>
        {expanded ? (
          <div className="home-assistant-transcript-tool-group-body">
            {bodyNodes.map((node) => (
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
        ) : null}
      </details>
    </section>
  );
}

function AssistantToolGroupSummary(props: {
  readonly parts: ReadonlyArray<AssistantToolGroupSummaryPart>;
  readonly separator: string;
}): JSX.Element {
  return (
    <span className="home-assistant-transcript-tool-group-summary-content">
      {props.parts.map((part, index) => (
        <span key={`${index}:${part.label}`} className="home-assistant-transcript-tool-group-summary-part">
          {index > 0 ? <span className="home-assistant-transcript-tool-group-summary-separator">{props.separator}</span> : null}
          {part.icon === null ? null : <AssistantToolGroupSummaryIcon kind={part.icon} />}
          <span className="home-assistant-transcript-tool-group-summary-text">{part.label}</span>
        </span>
      ))}
    </span>
  );
}

function AssistantToolGroupSummaryIcon(props: { readonly kind: AssistantToolGroupSummaryIcon }): JSX.Element {
  if (props.kind === "terminal") {
    return (
      <svg
        className="home-assistant-transcript-tool-group-summary-icon"
        data-summary-icon="terminal"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      >
        <rect x="2.25" y="3" width="11.5" height="10" rx="1.75" />
        <path d="m5.1 6.35 1.8 1.65-1.8 1.65" />
        <path d="M8.5 10.1h2.4" />
      </svg>
    );
  }

  return (
    <svg
      className="home-assistant-transcript-tool-group-summary-icon"
      data-summary-icon="edit"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    >
      <path d="M10.8 2.8a1.45 1.45 0 0 1 2.05 2.05l-7.1 7.1-2.75.75.75-2.75 7.05-7.15Z" />
      <path d="m9.75 3.85 2.4 2.4" />
    </svg>
  );
}

function createAssistantToolGroupBodyNodes(nodes: ReadonlyArray<AssistantTraceNode>): Array<AssistantTraceNode> {
  return nodes.flatMap((node) => {
    if (node.item.kind !== "fileChange" || node.item.changes.length <= 1) {
      return [node];
    }
    const fileChange = node.item;
    return fileChange.changes.map((change, index): AssistantTraceNode => ({
      ...node,
      key: `${node.key}:change:${index}`,
      item: {
        ...fileChange,
        id: `${fileChange.id}:change:${index}`,
        changes: [change],
      },
    }));
  });
}

function createRenderGroups(
  activities: ReadonlyArray<TimelineEntry>,
  activeTurnId: string | null,
  showProgress: boolean,
  turnStatuses: Readonly<Record<string, TurnStatus>>,
  threadDetailLevel: ThreadDetailLevel,
): Array<RenderGroup> {
  const displayActiveTurnId = resolveDisplayActiveTurnId(activities, activeTurnId, showProgress);
  const progressFallbackTurnId = activeTurnId === null && showProgress ? displayActiveTurnId : null;
  return splitActivitiesIntoRenderGroups(activities, displayActiveTurnId, threadDetailLevel)
    .map((group) => ({
      key: group.key,
      nodes: flattenConversationRenderGroup(group),
      showThinkingIndicator: group.showThinkingIndicator,
      progressFallback: progressFallbackTurnId !== null && group.turnId === progressFallbackTurnId,
      turnStatus: group.turnId === null ? null : turnStatuses[group.turnId] ?? null,
    }))
    .filter((group) => group.nodes.length > 0 || group.showThinkingIndicator);
}

function createAssistantDisplayNodes(
  nodes: ReadonlyArray<AssistantFlowRenderNode>,
  turnStatus: TurnStatus | null,
  showThinkingIndicator: boolean,
  progressFallback: boolean,
): Array<AssistantDisplayNode> {
  if (!shouldFoldAssistantToolGroups(nodes, turnStatus, showThinkingIndicator, progressFallback)) {
    return [...nodes];
  }

  const hasAssistantTextBefore = createAssistantTextBeforeMap(nodes);
  const hasAssistantTextAfter = createAssistantTextAfterMap(nodes);
  const displayNodes: Array<AssistantDisplayNode> = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];
    if (isSubagentTraceNode(node)) {
      const run: Array<AssistantSubagentTraceNode> = [];
      let cursor = index;
      while (cursor < nodes.length) {
        const runNode = nodes[cursor];
        if (!isSubagentTraceNode(runNode) || !sameSubagentGroup(node, runNode)) {
          break;
        }
        run.push(runNode);
        cursor += 1;
      }
      displayNodes.push({
        key: `subagent-group:${run.map((entry) => entry.key).join(":")}`,
        kind: "assistantSubagentGroup",
        nodes: run,
      });
      index = cursor;
      continue;
    }
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
  progressFallback: boolean,
): boolean {
  const streamStillActive = turnStatus === "inProgress"
    || progressFallback
    || (turnStatus === null && showThinkingIndicator);
  return streamStillActive === false
    && nodes.every((node) => node.kind !== "assistantMessage" || node.message.status !== "streaming");
}

function resolveDisplayActiveTurnId(
  activities: ReadonlyArray<TimelineEntry>,
  activeTurnId: string | null,
  showProgress: boolean,
): string | null {
  if (activeTurnId !== null || !showProgress) {
    return activeTurnId;
  }
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const entry = activities[index];
    if (entry.kind === "userMessage") {
      return entry.turnId;
    }
  }
  return null;
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
    || node.item.kind === "webSearch";
}

function isSubagentTraceNode(node: AssistantFlowRenderNode | undefined): node is AssistantSubagentTraceNode {
  return node?.kind === "traceItem" && node.item.kind === "collabAgentToolCall";
}

function sameSubagentGroup(left: AssistantSubagentTraceNode, right: AssistantSubagentTraceNode): boolean {
  return left.item.tool === right.item.tool && left.item.status === right.item.status;
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

function createAssistantToolGroupSummaryParts(
  nodes: ReadonlyArray<AssistantTraceNode>,
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<AssistantToolGroupSummaryPart> {
  const fileChangePart = createFileChangeToolGroupSummaryPart(nodes, t);
  if (fileChangePart !== null && nodes.every((node) => node.item.kind === "fileChange")) {
    return [fileChangePart];
  }

  const readFileCount = countReadFiles(nodes);
  if (readFileCount > 0 && nodes.every((node) => node.item.kind === "commandExecution" && getCommandReadPaths(node.item.command).length > 0)) {
    return [{ icon: "terminal", label: t("home.conversation.transcript.toolGroupReadFiles", { count: String(readFileCount) }) }];
  }

  const commandCount = nodes.filter((node) => node.item.kind === "commandExecution").length;
  if (commandCount === nodes.length) {
    return [{ icon: "terminal", label: t("home.conversation.transcript.toolGroupCommands", { count: String(commandCount) }) }];
  }

  const fileChangeNodeCount = nodes.filter((node) => node.item.kind === "fileChange").length;
  const otherToolCount = nodes.length - commandCount - fileChangeNodeCount;
  const parts = [
    fileChangePart,
    commandCount > 0
      ? { icon: "terminal", label: t("home.conversation.transcript.toolGroupCommands", { count: String(commandCount) }) }
      : null,
    otherToolCount > 0
      ? { icon: null, label: t("home.conversation.transcript.toolGroupTools", { count: String(otherToolCount) }) }
      : null,
  ].filter((part): part is AssistantToolGroupSummaryPart => part !== null);

  return parts.length > 0
    ? parts
    : [{ icon: null, label: t("home.conversation.transcript.toolGroupTools", { count: String(nodes.length) }) }];
}

function createFileChangeToolGroupSummaryPart(
  nodes: ReadonlyArray<AssistantTraceNode>,
  t: ReturnType<typeof useI18n>["t"],
): AssistantToolGroupSummaryPart | null {
  const editedFileCount = countEditedFiles(nodes);
  if (editedFileCount <= 0) {
    return null;
  }
  const labelKey = areAllFileChangesDeleted(nodes)
    ? "home.conversation.transcript.toolGroupDeletedFiles"
    : "home.conversation.transcript.toolGroupEditedFiles";
  return { icon: "edit", label: t(labelKey, { count: String(editedFileCount) }) };
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

function areAllFileChangesDeleted(nodes: ReadonlyArray<AssistantTraceNode>): boolean {
  let hasFileChange = false;
  for (const node of nodes) {
    if (node.item.kind !== "fileChange") {
      continue;
    }
    for (const change of node.item.changes) {
      hasFileChange = true;
      if (change.kind.type !== "delete") {
        return false;
      }
    }
  }
  return hasFileChange;
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
