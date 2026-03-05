import type { ConnectionStatus, WorkspaceView } from "../domain/types";

interface ControlBarProps {
  readonly status: ConnectionStatus;
  readonly activeView: WorkspaceView;
  readonly busy: boolean;
  readonly onViewChange: (view: WorkspaceView) => void;
  readonly onStart: () => Promise<void>;
  readonly onStop: () => Promise<void>;
  readonly onInitialize: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
  readonly onLoadThreads: () => Promise<void>;
  readonly onLoadModels: () => Promise<void>;
  readonly onReadConfig: () => Promise<void>;
  readonly onImport: () => Promise<void>;
}

const VIEWS: ReadonlyArray<WorkspaceView> = [
  "conversation",
  "settings",
  "skills",
  "mcp",
  "worktrees"
];

function statusClass(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "status status-connected";
    case "connecting":
      return "status status-connecting";
    case "error":
      return "status status-error";
    default:
      return "status status-idle";
  }
}

export function ControlBar(props: ControlBarProps): JSX.Element {
  const {
    status,
    activeView,
    busy,
    onViewChange,
    onStart,
    onStop,
    onInitialize,
    onLogin,
    onLoadThreads,
    onLoadModels,
    onReadConfig,
    onImport
  } = props;

  return (
    <header className="control-bar">
      <div className="control-group">
        <span className={statusClass(status)}>连接状态: {status}</span>
        <button disabled={busy} onClick={() => void onStart()}>
          启动 App Server
        </button>
        <button disabled={busy} onClick={() => void onStop()}>
          停止
        </button>
        <button disabled={busy} onClick={() => void onInitialize()}>
          initialize
        </button>
        <button disabled={busy} onClick={() => void onLogin()}>
          登录(ChatGPT)
        </button>
      </div>
      <div className="control-group">
        <button disabled={busy} onClick={() => void onLoadThreads()}>
          读取线程
        </button>
        <button disabled={busy} onClick={() => void onLoadModels()}>
          读取模型
        </button>
        <button disabled={busy} onClick={() => void onReadConfig()}>
          读取配置
        </button>
        <button disabled={busy} onClick={() => void onImport()}>
          导入官方数据
        </button>
      </div>
      <nav className="control-group">
        {VIEWS.map((view) => (
          <button
            key={view}
            className={view === activeView ? "tab tab-active" : "tab"}
            onClick={() => onViewChange(view)}
          >
            {view}
          </button>
        ))}
      </nav>
    </header>
  );
}
