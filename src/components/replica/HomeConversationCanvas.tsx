import { useEffect, useMemo, useRef } from "react";
import type { ServerRequestResolution, ThreadSummary, TimelineEntry } from "../../domain/types";
import { HomeTimelineEntry } from "./HomeTimelineEntry";
import { flattenConversationRenderGroup, splitActivitiesIntoRenderGroups } from "./localConversationGroups";

interface HomeConversationCanvasProps {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly selectedThread: ThreadSummary | null;
  readonly placeholder: { readonly title: string; readonly body: string } | null;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

interface RenderGroup {
  readonly key: string;
  readonly nodes: ReturnType<typeof flattenConversationRenderGroup>;
}

export function HomeConversationCanvas(props: HomeConversationCanvasProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderGroups = useMemo(() => createRenderGroups(props.activities, props.selectedThread), [props.activities, props.selectedThread]);
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
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function createRenderGroups(
  activities: ReadonlyArray<TimelineEntry>,
  selectedThread: ThreadSummary | null,
): Array<RenderGroup> {
  return splitActivitiesIntoRenderGroups(activities, selectedThread)
    .map((group) => ({ key: group.key, nodes: flattenConversationRenderGroup(group) }))
    .filter((group) => group.nodes.length > 0);
}

function createScrollKey(groups: ReadonlyArray<RenderGroup>): string {
  const lastGroup = groups[groups.length - 1];
  const lastNode = lastGroup?.nodes[lastGroup.nodes.length - 1];
  if (!lastNode) {
    return "empty";
  }
  if (lastNode.kind === "userBubble" || lastNode.kind === "assistantMessage") {
    return `${lastNode.key}:${lastNode.message.status}:${lastNode.message.text.length}`;
  }
  if (lastNode.kind === "thinkingBlock") {
    return `${lastNode.key}:${lastNode.block.kind}:${lastNode.block.summary ?? ""}`;
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
  return `${node.key}:${node.item.status}:${JSON.stringify(node.item.result)?.length ?? 0}`;
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
      <p className="home-chat-placeholder-title">会话已创建</p>
      <p className="home-chat-placeholder-body">发送第一条消息后，思考、工具调用、审批和文件变更都会出现在这里。</p>
    </div>
  );
}
