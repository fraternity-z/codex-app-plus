import { useMemo, useState } from "react";
import type { ServerRequestResolution } from "../../domain/types";
import type { PendingApprovalEntry, PendingUserInputEntry } from "../../domain/timeline";
import type { CommandExecutionApprovalDecision } from "../../protocol/generated/v2/CommandExecutionApprovalDecision";
import { HomeEntryCard } from "./HomeEntryCard";

interface HomeRequestEntryProps {
  readonly entry: PendingApprovalEntry | PendingUserInputEntry;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

export function HomeRequestEntry(props: HomeRequestEntryProps): JSX.Element {
  return props.entry.kind === "pendingApproval"
    ? <ApprovalRequest entry={props.entry} onResolveServerRequest={props.onResolveServerRequest} />
    : <UserInputRequest entry={props.entry} onResolveServerRequest={props.onResolveServerRequest} />;
}

function ApprovalRequest(props: {
  readonly entry: PendingApprovalEntry;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}): JSX.Element {
  const request = props.entry.request;
  return (
    <HomeEntryCard className="home-request-card" title={createApprovalTitle(request.kind)} status="等待处理" meta={request.method}>
      {request.kind === "commandApproval" ? <CommandApprovalBody entry={props.entry} /> : <FileApprovalBody entry={props.entry} />}
      <div className="home-request-actions">
        {createDecisionOptions(request.kind).map((decision) => (
          <button
            key={typeof decision === "string" ? decision : JSON.stringify(decision)}
            type="button"
            className={createDecisionClassName(decision)}
            onClick={() => void props.onResolveServerRequest(createApprovalResolution(props.entry, decision))}
          >
            {formatDecisionLabel(decision)}
          </button>
        ))}
      </div>
    </HomeEntryCard>
  );
}

function CommandApprovalBody(props: { readonly entry: PendingApprovalEntry }): JSX.Element {
  const params = props.entry.request.kind === "commandApproval" ? props.entry.request.params : null;
  if (params === null) {
    return <p className="home-request-copy">当前审批内容不可用。</p>;
  }
  return (
    <>
      <pre className="home-request-code">{params.command ?? "(unknown command)"}</pre>
      {params.cwd ? <p className="home-request-copy">{params.cwd}</p> : null}
      {params.reason ? <p className="home-request-copy">{params.reason}</p> : null}
    </>
  );
}

function FileApprovalBody(props: { readonly entry: PendingApprovalEntry }): JSX.Element {
  const params = props.entry.request.kind === "fileApproval" ? props.entry.request.params : null;
  if (params === null) {
    return <p className="home-request-copy">请确认是否应用这些文件变更。</p>;
  }
  return <p className="home-request-copy">{params.reason ?? "请确认是否应用这些文件变更。"}</p>;
}

function UserInputRequest(props: {
  readonly entry: PendingUserInputEntry;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}): JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => createInitialAnswers(props.entry));
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const questions = useMemo(() => props.entry.request.questions, [props.entry.request.questions]);

  return (
    <HomeEntryCard className="home-request-card" title="需要补充信息" status="等待输入" meta={props.entry.request.method}>
      <div className="home-request-form">
        {questions.map((question) => (
          <section key={question.id} className="home-request-question">
            <strong>{question.header}</strong>
            <p className="home-request-copy">{question.question}</p>
            <QuestionOptions questionId={question.id} options={question.options} answers={answers} onToggle={setAnswers} />
            {question.isOther || question.options === null ? (
              <input
                className="home-request-input"
                type={question.isSecret ? "password" : "text"}
                value={freeText[question.id] ?? ""}
                placeholder="输入补充内容"
                onChange={(event) => setFreeText((current) => ({ ...current, [question.id]: event.target.value }))}
              />
            ) : null}
          </section>
        ))}
      </div>
      <div className="home-request-actions">
        <button
          type="button"
          className="home-request-button home-request-button-primary"
          onClick={() => void props.onResolveServerRequest(buildUserInputResolution(props.entry, answers, freeText))}
        >
          提交
        </button>
      </div>
    </HomeEntryCard>
  );
}

function QuestionOptions(props: {
  readonly questionId: string;
  readonly options: PendingUserInputEntry["request"]["questions"][number]["options"];
  readonly answers: Record<string, string[]>;
  readonly onToggle: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}): JSX.Element | null {
  if (props.options === null) {
    return null;
  }
  return (
    <>
      {props.options.map((option) => (
        <label key={option.label} className="home-request-option">
          <input
            type="checkbox"
            checked={(props.answers[props.questionId] ?? []).includes(option.label)}
            onChange={() => props.onToggle((current) => toggleAnswer(current, props.questionId, option.label))}
          />
          <span>{option.label}</span>
          <small>{option.description}</small>
        </label>
      ))}
    </>
  );
}

function createInitialAnswers(entry: PendingUserInputEntry): Record<string, string[]> {
  return Object.fromEntries(entry.request.questions.map((question) => [question.id, [] as string[]]));
}

function toggleAnswer(
  current: Record<string, string[]>,
  questionId: string,
  optionLabel: string,
): Record<string, string[]> {
  const selected = current[questionId] ?? [];
  const nextValues = selected.includes(optionLabel)
    ? selected.filter((item) => item !== optionLabel)
    : [...selected, optionLabel];
  return { ...current, [questionId]: nextValues };
}

function buildUserInputResolution(
  entry: PendingUserInputEntry,
  answers: Record<string, string[]>,
  freeText: Record<string, string>,
): ServerRequestResolution {
  const payload = Object.fromEntries(
    entry.request.questions.map((question) => {
      const selected = answers[question.id] ?? [];
      const extra = freeText[question.id]?.trim();
      return [question.id, extra ? [...selected, extra] : selected];
    }),
  );
  return { kind: "userInput", requestId: entry.requestId, answers: payload };
}

function createApprovalTitle(kind: PendingApprovalEntry["request"]["kind"]): string {
  return kind === "commandApproval" ? "命令执行审批" : "文件变更审批";
}

function createDecisionOptions(
  kind: PendingApprovalEntry["request"]["kind"],
): ReadonlyArray<CommandExecutionApprovalDecision | "accept" | "decline"> {
  return kind === "commandApproval" ? ["accept", "acceptForSession", "decline"] : ["accept", "decline"];
}

function createDecisionClassName(decision: CommandExecutionApprovalDecision | "accept" | "decline"): string {
  return decision === "accept" || decision === "acceptForSession"
    ? "home-request-button home-request-button-primary"
    : "home-request-button";
}

function createApprovalResolution(
  entry: PendingApprovalEntry,
  decision: CommandExecutionApprovalDecision | "accept" | "decline",
): ServerRequestResolution {
  return entry.request.kind === "commandApproval"
    ? { kind: "commandApproval", requestId: entry.requestId, decision: decision as CommandExecutionApprovalDecision }
    : { kind: "fileApproval", requestId: entry.requestId, decision: decision as "accept" | "decline" };
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
