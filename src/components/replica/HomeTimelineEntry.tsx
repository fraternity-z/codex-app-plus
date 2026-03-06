import { useMemo, useState, type ReactNode } from "react";
import type { CommandExecutionApprovalDecision } from "../../protocol/generated/v2/CommandExecutionApprovalDecision";
import type { ServerRequestResolution, TimelineEntry } from "../../domain/types";
import { ConversationMessageContent } from "./ConversationMessageContent";

interface HomeTimelineEntryProps {
  readonly entry: TimelineEntry;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

function renderMarkdown(text: string, role: "user" | "assistant"): JSX.Element {
  return (
    <ConversationMessageContent
      className={role === "assistant" ? "home-chat-markdown home-chat-markdown-assistant" : "home-chat-markdown home-chat-markdown-user"}
      message={{ id: "render", kind: role === "assistant" ? "agentMessage" : "userMessage", role, threadId: "render", turnId: null, itemId: null, text, status: "done" }}
    />
  );
}

function TimelineCard(props: { readonly title: string; readonly subtitle?: string | null; readonly children: ReactNode }): JSX.Element {
  return (
    <article className="home-timeline-card">
      <header className="home-timeline-card-header">
        <strong>{props.title}</strong>
        {props.subtitle ? <span>{props.subtitle}</span> : null}
      </header>
      <div className="home-timeline-card-body">{props.children}</div>
    </article>
  );
}

function formatDecisionLabel(decision: CommandExecutionApprovalDecision | "accept" | "decline"): string {
  if (decision === "accept") return "允许";
  if (decision === "acceptForSession") return "本会话内允许";
  if (decision === "decline") return "拒绝";
  if (decision === "cancel") return "取消";
  if (typeof decision === "object" && "acceptWithExecpolicyAmendment" in decision) return "允许并更新规则";
  if (typeof decision === "object" && "applyNetworkPolicyAmendment" in decision) return "更新网络策略";
  return "提交";
}

function formatEntryStatus(status: string): string {
  if (status === "inProgress") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "declined") return "已拒绝";
  if (status === "interrupted") return "已中断";
  return status;
}

function QuestionRequestCard(props: { readonly entry: Extract<TimelineEntry, { kind: "pendingUserInput" }>; readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void> }): JSX.Element {
  const initialAnswers = useMemo(
    () => Object.fromEntries(props.entry.request.questions.map((question) => [question.id, [] as string[]])),
    [props.entry.request.questions]
  );
  const [answers, setAnswers] = useState<Record<string, string[]>>(initialAnswers);
  const [freeText, setFreeText] = useState<Record<string, string>>({});

  const toggleOption = (questionId: string, optionLabel: string) => {
    setAnswers((current) => {
      const existing = current[questionId] ?? [];
      return {
        ...current,
        [questionId]: existing.includes(optionLabel) ? existing.filter((item) => item !== optionLabel) : [...existing, optionLabel]
      };
    });
  };

  const submit = async () => {
    const payload = Object.fromEntries(
      props.entry.request.questions.map((question) => {
        const baseAnswers = answers[question.id] ?? [];
        const extra = freeText[question.id]?.trim();
        return [question.id, extra ? [...baseAnswers, extra] : baseAnswers];
      })
    );
    await props.onResolveServerRequest({ kind: "userInput", requestId: props.entry.requestId, answers: payload });
  };

  return (
    <TimelineCard title="需要补充信息" subtitle={props.entry.request.method}>
      <div className="home-request-form">
        {props.entry.request.questions.map((question) => (
          <section key={question.id} className="home-request-question">
            <strong>{question.header}</strong>
            <p>{question.question}</p>
            {question.options?.map((option) => (
              <label key={option.label} className="home-request-option">
                <input
                  type="checkbox"
                  checked={(answers[question.id] ?? []).includes(option.label)}
                  onChange={() => toggleOption(question.id, option.label)}
                />
                <span>{option.label}</span>
                <small>{option.description}</small>
              </label>
            ))}
            {(question.isOther || question.options === null) ? (
              <input
                className="home-request-input"
                type={question.isSecret ? "password" : "text"}
                value={freeText[question.id] ?? ""}
                placeholder="输入答案"
                onChange={(event) => setFreeText((current) => ({ ...current, [question.id]: event.currentTarget.value }))}
              />
            ) : null}
          </section>
        ))}
        <div className="home-request-actions">
          <button type="button" className="home-request-button home-request-button-primary" onClick={() => void submit()}>
            提交
          </button>
        </div>
      </div>
    </TimelineCard>
  );
}

function ApprovalRequestCard(props: { readonly entry: Extract<TimelineEntry, { kind: "pendingApproval" }>; readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void> }): JSX.Element {
  const request = props.entry.request;
  const decisions = request.kind === "commandApproval" ? (request.params.availableDecisions ?? ["accept", "acceptForSession", "decline", "cancel"]) : ["accept", "decline"];

  return (
    <TimelineCard title={request.kind === "commandApproval" ? "命令审批" : "文件变更审批"} subtitle={request.method}>
      {request.kind === "commandApproval" ? (
        <>
          <pre className="home-timeline-pre">{request.params.command ?? "(unknown command)"}</pre>
          {request.params.cwd ? <div className="home-timeline-meta">cwd: {request.params.cwd}</div> : null}
          {request.params.reason ? <p>{request.params.reason}</p> : null}
        </>
      ) : (
        <p>{request.params.reason ?? "请确认是否应用这些文件变更。"}</p>
      )}
      <div className="home-request-actions">
        {decisions.map((decision) => (
          <button
            key={typeof decision === "string" ? decision : JSON.stringify(decision)}
            type="button"
            className={decision === "accept" || decision === "acceptForSession" ? "home-request-button home-request-button-primary" : "home-request-button"}
            onClick={() =>
              void props.onResolveServerRequest(
                request.kind === "commandApproval"
                  ? { kind: "commandApproval", requestId: props.entry.requestId, decision: decision as CommandExecutionApprovalDecision }
                  : { kind: "fileApproval", requestId: props.entry.requestId, decision: decision as "accept" | "decline" }
              )
            }
          >
            {formatDecisionLabel(decision as never)}
          </button>
        ))}
      </div>
    </TimelineCard>
  );
}

export function HomeTimelineEntry(props: HomeTimelineEntryProps): JSX.Element | null {
  const entry = props.entry;

  if (entry.kind === "userMessage") {
    return <article className="home-chat-message home-chat-message-user"><div className="home-chat-bubble">{renderMarkdown(entry.text, "user")}</div></article>;
  }

  if (entry.kind === "agentMessage") {
    return <article className="home-chat-message home-chat-message-assistant">{renderMarkdown(entry.text, "assistant")}</article>;
  }

  if (entry.kind === "plan") {
    return <TimelineCard title="计划草案" subtitle={entry.status === "streaming" ? "生成中" : "已完成"}>{renderMarkdown(entry.text, "assistant")}</TimelineCard>;
  }

  if (entry.kind === "reasoning") {
    return <TimelineCard title="Reasoning"><pre className="home-timeline-pre">{[...entry.summary, ...entry.content].join("\n\n")}</pre></TimelineCard>;
  }

  if (entry.kind === "commandExecution") {
    return (
      <TimelineCard title="命令执行" subtitle={formatEntryStatus(entry.status)}>
        <div className="home-timeline-meta">{entry.cwd}</div>
        <pre className="home-timeline-pre">{entry.command}</pre>
        {entry.output.length > 0 ? <pre className="home-timeline-pre home-timeline-output">{entry.output}</pre> : null}
        {entry.terminalInteractions.length > 0 ? <pre className="home-timeline-pre">stdin:\n{entry.terminalInteractions.join("\n")}</pre> : null}
        <div className="home-timeline-meta">exit: {entry.exitCode ?? "-"} · duration: {entry.durationMs ?? "-"}ms</div>
      </TimelineCard>
    );
  }

  if (entry.kind === "fileChange") {
    return (
      <TimelineCard title="文件变更" subtitle={formatEntryStatus(entry.status)}>
        <ul className="home-timeline-list">
          {entry.changes.map((change, index) => <li key={`${change.path}-${index}`}>{change.path}</li>)}
        </ul>
        {entry.output.length > 0 ? <pre className="home-timeline-pre home-timeline-output">{entry.output}</pre> : null}
      </TimelineCard>
    );
  }

  if (entry.kind === "mcpToolCall") {
    return <TimelineCard title={`MCP: ${entry.server}/${entry.tool}`} subtitle={formatEntryStatus(entry.status)}><pre className="home-timeline-pre">{JSON.stringify(entry.arguments, null, 2)}</pre></TimelineCard>;
  }

  if (entry.kind === "turnPlanSnapshot") {
    return (
      <TimelineCard title="执行计划" subtitle={entry.explanation}>
        <ul className="home-timeline-checklist">
          {entry.plan.map((step, index) => <li key={`${step.step}-${index}`} data-status={step.status}>{step.step}</li>)}
        </ul>
      </TimelineCard>
    );
  }

  if (entry.kind === "turnDiffSnapshot") {
    return <TimelineCard title="聚合 Diff"><pre className="home-timeline-pre home-timeline-output">{entry.diff}</pre></TimelineCard>;
  }

  if (entry.kind === "pendingApproval") {
    return <ApprovalRequestCard entry={entry} onResolveServerRequest={props.onResolveServerRequest} />;
  }

  if (entry.kind === "pendingUserInput") {
    return <QuestionRequestCard entry={entry} onResolveServerRequest={props.onResolveServerRequest} />;
  }

  if (entry.kind === "queuedFollowUp") {
    return null;
  }

  if (entry.kind === "debug") {
    return <TimelineCard title={entry.title}><pre className="home-timeline-pre">{JSON.stringify(entry.payload, null, 2)}</pre></TimelineCard>;
  }

  return null;
}
