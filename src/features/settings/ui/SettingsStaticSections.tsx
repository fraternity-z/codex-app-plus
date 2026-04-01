import { useI18n } from "../../../i18n";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";

function SectionHeader(props: {
  readonly title: string;
  readonly subtitle?: string;
}): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      {props.subtitle ? <p className="settings-subtitle">{props.subtitle}</p> : null}
    </header>
  );
}


export function EnvironmentContent(props: {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly onAddRoot: () => void;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <SectionHeader title={t("settings.environment.title")} />
      <section className="settings-card">
        <div className="settings-section-head">
          <strong>{t("settings.environment.workspacesTitle")}</strong>
          <button type="button" className="settings-head-action" onClick={props.onAddRoot}>
            {t("settings.environment.addProjectAction")}
          </button>
        </div>
        <p className="settings-note">{t("settings.environment.note")}</p>
        {props.roots.map((root) => (
          <div key={root.id} className="settings-env-row">
            <div className="settings-env-main">
              <span className="settings-folder">▣</span>
              <strong>{root.name}</strong>
              <span>{root.path}</span>
            </div>
          </div>
        ))}
        {props.roots.length === 0 ? (
          <div className="settings-empty">{t("settings.environment.empty")}</div>
        ) : null}
      </section>
    </div>
  );
}

export function WorktreeContent(props: {
  readonly worktrees: ReadonlyArray<{ readonly path: string; readonly branch: string | null; readonly isCurrent: boolean }>;
  readonly onCreateWorktree?: () => Promise<void>;
  readonly onDeleteWorktree?: (worktreePath: string) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <SectionHeader title={t("settings.worktree.title")} />
      <section className="settings-card">
        <div className="settings-row">
          <div>
            <strong>{t("settings.worktree.autoCleanLabel")}</strong>
            <p>{t("settings.worktree.autoCleanDescription")}</p>
          </div>
          <span className="settings-toggle settings-toggle-on">
            <span className="settings-toggle-knob" />
          </span>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t("settings.worktree.retentionLabel")}</strong>
            <p>{t("settings.worktree.retentionDescription")}</p>
          </div>
          <span className="settings-chip settings-chip-sm">15</span>
        </div>
      </section>
      <section className="settings-panel-group">
        <h2 className="settings-section-title">{t("settings.worktree.managedTitle")}</h2>
        <section className="settings-card">
          {props.worktrees.length === 0 ? (
            <div className="settings-empty">{t("settings.worktree.empty")}</div>
          ) : (
            props.worktrees.map((worktree) => (
              <div key={worktree.path} className="settings-env-row">
                <div className="settings-env-main">
                  <strong>{worktree.branch ?? t("settings.worktree.unknownBranch")}</strong>
                  <span>{worktree.path}</span>
                </div>
                {props.onDeleteWorktree ? (
                  <button type="button" className="settings-head-action" onClick={() => {
                    void props.onDeleteWorktree?.(worktree.path);
                  }}>
                    {t("settings.worktree.deleteAction")}
                  </button>
                ) : null}
              </div>
            ))
          )}
          {props.onCreateWorktree ? (
            <div className="settings-section-head">
              <button type="button" className="settings-head-action" onClick={() => {
                void props.onCreateWorktree?.();
              }}>
                {t("settings.worktree.createAction")}
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}

export function PlaceholderContent(props: { readonly sectionTitle: string }): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <SectionHeader title={props.sectionTitle} />
      <section className="settings-card">
        <div className="settings-placeholder">{t("settings.placeholder.message")}</div>
      </section>
    </div>
  );
}
