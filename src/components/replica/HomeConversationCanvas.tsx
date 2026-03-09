import { useEffect, useMemo, useRef } from "react";
import type { ServerRequestResolution, ThreadSummary, TimelineEntry } from "../../domain/types";
import { HomeTimelineEntry } from "./HomeTimelineEntry";
import { HomeTurnThinkingIndicator } from "./HomeTurnThinkingIndicator";
import { flattenConversationRenderGroup, splitActivitiesIntoRenderGroups } from "./localConversationGroups";

interface HomeConversationCanvasProps {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly selectedThread: ThreadSummary | null;
  readonly activeTurnId: string | null;
  readonly placeholder: { readonly title: string; readonly body: string } | null;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

interface RenderGroup {
  readonly key: string;
  readonly nodes: ReturnType<typeof flattenConversationRenderGroup>;
  readonly showThinkingIndicator: boolean;
}

export function HomeConversationCanvas(props: HomeConversationCanvasProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderGroups = useMemo(() => createRenderGroups(props.activities, props.activeTurnId), [props.activities, props.activeTurnId]);
  const scrollKey = useMemo(() => createScrollKey(renderGroups), [renderGroups]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [scrollKey]);

  return (
    <main className="home-conversation" aria-label="会话内容">
      <div ref={scrollRef} className="home-conversation-scroll">
        <div className="home-conversation-thread">
          {renderGroups.length === 0 ? <ConversationPlaceholder placeholder={props.placeholder} /> : null}
          {renderGroups.map((group) => (
            <section key={group.key} className="home-turn-group">
              {group.nodes.map((node) => (
                <HomeTimelineEntry key={node.key} node={node} onResolveServerRequest={props.onResolveServerRequest} />
              ))}
              {group.showThinkingIndicator ? <HomeTurnThinkingIndicator /> : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function createRenderGroups(
  activities: ReadonlyArray<TimelineEntry>,
  activeTurnId: string | null,
): Array<RenderGroup> {
  return splitActivitiesIntoRenderGroups(activities, activeTurnId)
    .map((group) => ({
      key: group.key,
      nodes: flattenConversationRenderGroup(group),
      showThinkingIndicator: group.showThinkingIndicator,
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

function createLastNodeScrollKey(nodes: ReadonlyArray<RenderGroup["nodes"][number]>): string {
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
    return `${lastNode.key}:${lastNode.block.summary}`;
  }
  if (lastNode.kind === "traceItem") {
    return createTraceScrollKey(lastNode);
  }
  return lastNode.key;
}

function createTraceScrollKey(node: Extract<RenderGroup["nodes"][number], { kind: "traceItem" }>): string {
  if (node.item.kind === "commandExecution") {
    return `${node.key}:${node.item.status}:${node.item.output.length}`;
  }
  if (node.item.kind === "fileChange") {
    return `${node.key}:${node.item.status}:${node.item.output.length}:${node.item.changes.length}`;
  }
  if (node.item.kind === "mcpToolCall") {
    return `${node.key}:${node.item.status}:${JSON.stringify(node.item.result)?.length ?? 0}:${node.item.progress.length}`;
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

function ConversationPlaceholder(props: { readonly placeholder: HomeConversationCanvasProps["placeholder"] }): JSX.Element {
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
      <p className="home-chat-placeholder-body">Your turns, tools, approvals, plans, realtime events, and file changes appear here.</p>
    </div>
  );
}
