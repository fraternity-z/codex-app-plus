import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type {
  ConnectionStatus,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
} from "../../../domain/types";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import type { ConnectionRetryInfo } from "../../home/model/homeConnectionRetry";
import {
  flattenConversationRenderGroup,
  splitActivitiesIntoRenderGroups,
} from "../model/localConversationGroups";
import { HomeConnectionStatusToast } from "../../home/ui/HomeConnectionStatusToast";
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
}

interface RenderGroup {
  readonly key: string;
  readonly nodes: ReturnType<typeof flattenConversationRenderGroup>;
  readonly showThinkingIndicator: boolean;
  readonly turnStatus: TurnStatus | null;
}

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
              return (
                <div
                  key={group.key}
                  className="home-conversation-row"
                  data-index={virtualRow.index}
                  ref={(node) => setGroupRef(group.key, node)}
                  style={{ transform: `translate3d(0, ${virtualRow.start}px, 0)` }}
                >
                  <section className="home-turn-group">
                    {group.nodes.map((node) => (
                      <HomeTimelineEntry
                        key={node.key}
                        node={node}
                        turnStatus={group.turnStatus}
                        onResolveServerRequest={props.onResolveServerRequest}
                      />
                    ))}
                    {group.showThinkingIndicator ? <HomeTurnThinkingIndicator /> : null}
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
