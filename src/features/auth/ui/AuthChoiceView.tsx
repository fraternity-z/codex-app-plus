interface AuthChoiceViewProps {
  readonly busy: boolean;
  readonly loginPending: boolean;
  readonly onLogin: () => Promise<void>;
  readonly onUseApiKey: () => void;
}

export function AuthChoiceView(props: AuthChoiceViewProps): JSX.Element {
  return (
    <main className="auth-choice-layout" aria-label="鉴权选择">
      <section className="auth-choice-card">
        <div className="auth-choice-copy">
          <span className="auth-choice-badge">Codex App Plus</span>
          <h1 className="auth-choice-title">选择登录方式</h1>
          <p className="auth-choice-subtitle">你可以使用官方 ChatGPT 账户登录，或进入配置页使用 API Key。</p>
        </div>
        <div className="auth-choice-actions">
          <button type="button" className="auth-choice-button auth-choice-button-primary" onClick={() => void props.onLogin()} disabled={props.busy}>
            {props.loginPending ? "正在跳转登录…" : "使用账户登录"}
          </button>
          <button type="button" className="auth-choice-button" onClick={props.onUseApiKey} disabled={props.busy}>
            使用 API Key
          </button>
        </div>
      </section>
    </main>
  );
}
