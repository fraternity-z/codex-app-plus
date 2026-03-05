import type { TimelineItem } from "../domain/types";

interface TimelinePanelProps {
  readonly selectedThreadId: string | null;
  readonly timeline: ReadonlyArray<TimelineItem>;
  readonly inputText: string;
  readonly busy: boolean;
  readonly onInputChange: (text: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onSendTurn: () => Promise<void>;
}

function roleClass(role: TimelineItem["role"]): string {
  switch (role) {
    case "assistant":
      return "timeline-item timeline-assistant";
    case "user":
      return "timeline-item timeline-user";
    default:
      return "timeline-item timeline-system";
  }
}

export function TimelinePanel(props: TimelinePanelProps): JSX.Element {
  const { selectedThreadId, timeline, inputText, busy, onInputChange, onCreateThread, onSendTurn } = props;

  return (
    <section className="timeline-panel">
      <header className="panel-header">
        <h2>Conversation</h2>
        <div className="panel-actions">
          <span>thread: {selectedThreadId ?? "none"}</span>
          <button disabled={busy} onClick={() => void onCreateThread()}>
            新建线程
          </button>
        </div>
      </header>
      <div className="timeline">
        {timeline.map((item) => (
          <article key={item.id} className={roleClass(item.role)}>
            <div className="timeline-role">{item.role}</div>
            <pre>{item.text}</pre>
          </article>
        ))}
        {timeline.length === 0 ? <p className="empty-text">暂无消息</p> : null}
      </div>
      <footer className="composer">
        <textarea
          value={inputText}
          placeholder="输入 turn/start 文本…"
          onChange={(event) => onInputChange(event.target.value)}
        />
        <button disabled={busy || selectedThreadId === null || inputText.trim().length === 0} onClick={() => void onSendTurn()}>
          发送 Turn
        </button>
      </footer>
    </section>
  );
}
