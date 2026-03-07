import { useEffect, useMemo, useRef } from "react";
import type { ServerRequestResolution, ThreadSummary, TimelineEntry } from "../../domain/types";
import { HomeTimelineEntry } from "./HomeTimelineEntry";
import { splitActivitiesIntoRenderGroups } from "./localConversationGroups";

interface HomeConversationCanvasProps {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly selectedThread: ThreadSummary | null;
  readonly placeholder: { readonly title: string; readonly body: string } | null;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

function ConversationPlaceholder(props: { readonly selectedThread: ThreadSummary | null; readonly placeholder: HomeConversationCanvasProps["placeholder"] }): JSX.Element {
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
      <p className="home-chat-placeholder-body">发送第一条消息后，计划、命令、审批和文件变更都会显示在这里。</p>
    </div>
  );
}

function filterVisibleActivities(activities: ReadonlyArray<TimelineEntry>): ReadonlyArray<TimelineEntry> {
  return activities.filter((entry) => entry.kind !== "queuedFollowUp");
}

function createScrollKey(entry: TimelineEntry | null): string {
  if (entry === null) {
    return "empty";
  }
  if (entry.kind === "agentMessage" || entry.kind === "userMessage" || entry.kind === "plan") {
    return `${entry.id}:${entry.status}:${entry.text.length}`;
  }
  if (entry.kind === "commandExecution") {
    return `${entry.id}:${entry.status}:${entry.output.length}:${entry.terminalInteractions.length}`;
  }
  if (entry.kind === "fileChange") {
    return `${entry.id}:${entry.status}:${entry.output.length}`;
  }
  return entry.id;
}

export function HomeConversationCanvas(props: HomeConversationCanvasProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visibleActivities = useMemo(() => filterVisibleActivities(props.activities), [props.activities]);
  const renderGroups = useMemo(() => splitActivitiesIntoRenderGroups(visibleActivities), [visibleActivities]);
  const lastActivity = visibleActivities[visibleActivities.length - 1] ?? null;
  const scrollKey = useMemo(() => createScrollKey(lastActivity), [lastActivity]);

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
          {visibleActivities.length === 0 ? <ConversationPlaceholder selectedThread={props.selectedThread} placeholder={props.placeholder} /> : null}
          {renderGroups.map((group) => (
            <section key={group.key} className="home-turn-group">
              {group.userItems.map((entry) => (
                <HomeTimelineEntry key={entry.id} entry={entry} onResolveServerRequest={props.onResolveServerRequest} />
              ))}
              {group.proposedPlanItem ? <HomeTimelineEntry entry={group.proposedPlanItem} onResolveServerRequest={props.onResolveServerRequest} /> : null}
              {group.agentItems.map((entry) => (
                <HomeTimelineEntry key={entry.id} entry={entry} onResolveServerRequest={props.onResolveServerRequest} />
              ))}
              {group.assistantItem ? <HomeTimelineEntry entry={group.assistantItem} onResolveServerRequest={props.onResolveServerRequest} /> : null}
              {group.unifiedDiffItem ? <HomeTimelineEntry entry={group.unifiedDiffItem} onResolveServerRequest={props.onResolveServerRequest} /> : null}
              {group.approvalItem ? <HomeTimelineEntry entry={group.approvalItem} onResolveServerRequest={props.onResolveServerRequest} /> : null}
              {group.userInputItem ? <HomeTimelineEntry entry={group.userInputItem} onResolveServerRequest={props.onResolveServerRequest} /> : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
