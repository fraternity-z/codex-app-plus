import type {
  AuthStatus,
  ConnectionStatus,
  ConversationMessage,
  ReceivedServerRequest,
  ThreadSummary
} from "../../../domain/types";

interface ConversationPaneProps {
  readonly busy: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly retryScheduledAt: number | null;
  readonly inputText: string;
  readonly selectedRootPath: string | null;
  readonly selectedThreadId: string | null;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly messages: ReadonlyArray<ConversationMessage>;
  readonly pendingServerRequests: ReadonlyArray<ReceivedServerRequest>;
  readonly onInputChange: (text: string) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onSendTurn: () => Promise<void>;
  readonly onRetryConnection: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
  readonly onApproveRequest: (requestId: string) => Promise<void>;
  readonly onRejectRequest: (requestId: string) => Promise<void>;
}

function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中";
    case "error":
      return "连接异常";
    default:
      return "未连接";
  }
}

function authLabel(status: AuthStatus, mode: string | null): string {
  if (status === "authenticated") {
    return mode === null ? "已登录" : `已登录 · ${mode}`;
  }
  if (status === "needs_login") {
    return "需要登录";
  }
  return "鉴权状态未知";
}

function MessageItem(props: { readonly message: ConversationMessage }): JSX.Element {
  const className = `message-bubble message-bubble-${props.message.role}`;
  return (
    <article className={className}>
      <header className="message-meta">
        <span>{props.message.role === "assistant" ? "Codex" : "你"}</span>
        <span>{props.message.status === "streaming" ? "生成中" : "完成"}</span>
      </header>
      <pre>{props.message.text}</pre>
    </article>
  );
}

function ThreadStrip(props: {
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThreadId: string | null;
  readonly onSelectThread: (threadId: string) => void;
}): JSX.Element {
  return (
    <div className="thread-strip" aria-label="线程列表">
      {props.threads.map((thread) => {
        const active = thread.id === props.selectedThreadId;
        return (
          <button
            key={thread.id}
            type="button"
            className={active ? "thread-pill thread-pill-active" : "thread-pill"}
            onClick={() => props.onSelectThread(thread.id)}
          >
            <span>{thread.title || thread.id}</span>
            <small>{new Date(thread.updatedAt).toLocaleString()}</small>
          </button>
        );
      })}
    </div>
  );
}

function ApprovalPanel(props: {
  readonly requests: ReadonlyArray<ReceivedServerRequest>;
  readonly onApproveRequest: (requestId: string) => Promise<void>;
  readonly onRejectRequest: (requestId: string) => Promise<void>;
}): JSX.Element | null {
  if (props.requests.length === 0) {
    return null;
  }

  return (
    <section className="approval-panel">
      <h2>待处理审批</h2>
      {props.requests.map((request) => (
        <article key={request.id} className="approval-card">
          <div>
            <strong>{request.method}</strong>
            <pre>{JSON.stringify(request.params, null, 2)}</pre>
          </div>
          <div className="approval-actions">
            <button type="button" onClick={() => void props.onApproveRequest(request.id)}>
              允许
            </button>
            <button type="button" onClick={() => void props.onRejectRequest(request.id)}>
              拒绝
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function StatusBanner(props: {
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly retryScheduledAt: number | null;
  readonly busy: boolean;
  readonly onRetryConnection: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
}): JSX.Element {
  const bannerClassName = props.fatalError === null ? "status-banner" : "status-banner status-banner-error";
  return (
    <section className={bannerClassName}>
      <div>
        <strong>{connectionLabel(props.connectionStatus)}</strong>
        <div>{authLabel(props.authStatus, props.authMode)}</div>
        {props.retryScheduledAt !== null ? <div>已安排自动重试</div> : null}
        {props.fatalError !== null ? <div>{props.fatalError}</div> : null}
      </div>
      <div className="status-actions">
        <button type="button" disabled={props.busy} onClick={() => void props.onRetryConnection()}>
          立即重试
        </button>
        {props.authStatus === "needs_login" ? (
          <button type="button" disabled={props.busy} onClick={() => void props.onLogin()}>
            登录 Codex
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Composer(props: {
  readonly busy: boolean;
  readonly inputText: string;
  readonly selectedRootPath: string | null;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: () => Promise<void>;
}): JSX.Element {
  const canSend = !props.busy && props.selectedRootPath !== null && props.inputText.trim().length > 0;
  const placeholder = props.selectedRootPath === null ? "请先选择工作区" : "输入消息，按发送开始对话";
  return (
    <footer className="conversation-composer">
      <textarea
        value={props.inputText}
        placeholder={placeholder}
        onChange={(event) => props.onInputChange(event.currentTarget.value)}
      />
      <button type="button" aria-label="发送消息" disabled={!canSend} onClick={() => void props.onSendTurn()}>
        发送
      </button>
    </footer>
  );
}

export function ConversationPane(props: ConversationPaneProps): JSX.Element {
  return (
    <section className="conversation-layout">
      <StatusBanner
        busy={props.busy}
        connectionStatus={props.connectionStatus}
        fatalError={props.fatalError}
        authStatus={props.authStatus}
        authMode={props.authMode}
        retryScheduledAt={props.retryScheduledAt}
        onRetryConnection={props.onRetryConnection}
        onLogin={props.onLogin}
      />
      <ThreadStrip
        threads={props.threads}
        selectedThreadId={props.selectedThreadId}
        onSelectThread={props.onSelectThread}
      />
      <ApprovalPanel
        requests={props.pendingServerRequests}
        onApproveRequest={props.onApproveRequest}
        onRejectRequest={props.onRejectRequest}
      />
      <div className="message-list">
        {props.messages.length > 0 ? props.messages.map((message) => <MessageItem key={message.id} message={message} />) : null}
        {props.messages.length === 0 && props.selectedThreadId !== null ? <p className="empty-text">暂无消息</p> : null}
        {props.messages.length === 0 && props.selectedThreadId === null ? (
          <p className="empty-text">选择线程或直接发送第一条消息开始对话</p>
        ) : null}
      </div>
      <Composer
        busy={props.busy}
        inputText={props.inputText}
        selectedRootPath={props.selectedRootPath}
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
      />
    </section>
  );
}
