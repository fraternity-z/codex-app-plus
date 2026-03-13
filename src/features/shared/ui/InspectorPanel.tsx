import type { ReceivedNotification, ReceivedServerRequest, WorkspaceView } from "../../../domain/types";

interface InspectorPanelProps {
  readonly activeView: WorkspaceView;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly pendingRequests: ReadonlyArray<ReceivedServerRequest>;
  readonly models: ReadonlyArray<string>;
  readonly configSnapshot: unknown;
  readonly onApproveRequest: (requestId: string) => Promise<void>;
  readonly onRejectRequest: (requestId: string) => Promise<void>;
}

function renderViewLabel(view: WorkspaceView): string {
  if (view === "conversation") {
    return "会话调试面板";
  }
  return `${view} 面板`;
}

export function InspectorPanel(props: InspectorPanelProps): JSX.Element {
  const { activeView, notifications, pendingRequests, models, configSnapshot, onApproveRequest, onRejectRequest } =
    props;

  return (
    <aside className="inspector">
      <h2>{renderViewLabel(activeView)}</h2>
      <section>
        <h3>待审批请求</h3>
        {pendingRequests.length === 0 ? <p className="empty-text">无待审批请求</p> : null}
        {pendingRequests.map((request) => (
          <article className="request-item" key={request.id}>
            <strong>{request.method}</strong>
            <pre>{JSON.stringify(request.params, null, 2)}</pre>
            <div className="request-actions">
              <button onClick={() => void onApproveRequest(request.id)}>Approve</button>
              <button onClick={() => void onRejectRequest(request.id)}>Reject</button>
            </div>
          </article>
        ))}
      </section>
      <section>
        <h3>Models</h3>
        {models.length === 0 ? <p className="empty-text">未加载</p> : null}
        <ul className="model-list">
          {models.map((model) => (
            <li key={model}>{model}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Config Snapshot</h3>
        <pre>{JSON.stringify(configSnapshot, null, 2)}</pre>
      </section>
      <section>
        <h3>Notifications</h3>
        {notifications.slice(-20).map((notification, index) => (
          <article key={`${notification.method}-${index}`} className="notification-item">
            <strong>{notification.method}</strong>
            <pre>{JSON.stringify(notification.params, null, 2)}</pre>
          </article>
        ))}
      </section>
    </aside>
  );
}
