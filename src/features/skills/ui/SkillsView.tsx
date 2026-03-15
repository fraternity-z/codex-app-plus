import type { ReceivedNotification } from "../../../domain/types";
import type { SkillsConfigWriteParams } from "../../../protocol/generated/v2/SkillsConfigWriteParams";
import type { SkillsConfigWriteResponse } from "../../../protocol/generated/v2/SkillsConfigWriteResponse";
import type { SkillsListParams } from "../../../protocol/generated/v2/SkillsListParams";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import type { SkillsRemoteReadParams } from "../../../protocol/generated/v2/SkillsRemoteReadParams";
import type { SkillsRemoteReadResponse } from "../../../protocol/generated/v2/SkillsRemoteReadResponse";
import type { SkillsRemoteWriteParams } from "../../../protocol/generated/v2/SkillsRemoteWriteParams";
import type { SkillsRemoteWriteResponse } from "../../../protocol/generated/v2/SkillsRemoteWriteResponse";
import "../../../styles/replica/replica-skills.css";
import { useSkillsViewModel } from "../hooks/useSkillsViewModel";
import type { InstalledSkillCard, RemoteSkillCard } from "../model/skillCatalog";
import { SkillAvatar } from "./SkillAvatar";

export interface SkillsViewProps {
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly onBackHome: () => void;
  readonly onOpenLearnMore: () => Promise<void>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listRemoteSkills: (params: SkillsRemoteReadParams) => Promise<SkillsRemoteReadResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly exportRemoteSkill: (params: SkillsRemoteWriteParams) => Promise<SkillsRemoteWriteResponse>;
}

export function SkillsView(props: SkillsViewProps): JSX.Element {
  const model = useSkillsViewModel({
    selectedRootPath: props.selectedRootPath,
    notifications: props.notifications,
    listSkills: props.listSkills,
    listRemoteSkills: props.listRemoteSkills,
    writeSkillConfig: props.writeSkillConfig,
    exportRemoteSkill: props.exportRemoteSkill,
  });

  return (
    <div className="skills-page">
      <SkillsToolbar
        query={model.query}
        refreshPending={model.refreshPending}
        onBackHome={props.onBackHome}
        onOpenLearnMore={props.onOpenLearnMore}
        onRefresh={model.refresh}
        onQueryChange={model.setQuery}
      />
      <main className="skills-main">
        <InstalledSkillsSection
          actionError={model.actionError}
          installedError={model.installedError}
          loading={model.loadingInstalled}
          pendingPaths={model.pendingPaths}
          scanErrors={model.scanErrors}
          skills={model.installedSkills}
          onToggleSkillEnabled={model.toggleSkillEnabled}
        />
        <RecommendedSkillsSection
          error={model.recommendedError}
          installingIds={model.installingIds}
          loading={model.loadingRecommended}
          skills={model.recommendedSkills}
          onInstallSkill={model.installRemoteSkill}
        />
      </main>
    </div>
  );
}

function SkillsToolbar(props: {
  readonly query: string;
  readonly refreshPending: boolean;
  readonly onBackHome: () => void;
  readonly onOpenLearnMore: () => Promise<void>;
  readonly onRefresh: () => Promise<void>;
  readonly onQueryChange: (value: string) => void;
}): JSX.Element {
  return (
    <header className="skills-toolbar">
      <button type="button" className="skills-back-button" onClick={props.onBackHome}>
        ← 返回应用
      </button>
      <div className="skills-toolbar-actions">
        <button type="button" className="skills-ghost-button" onClick={() => void props.onRefresh()} disabled={props.refreshPending}>
          <RefreshIcon />
          <span>{props.refreshPending ? "刷新中" : "刷新"}</span>
        </button>
        <label className="skills-search-field">
          <SearchIcon />
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="搜索技能"
            aria-label="搜索技能"
          />
        </label>
        <button
          type="button"
          className="skills-primary-button"
          disabled
          title="暂未接入本地创建技能链路"
        >
          + 新技能
        </button>
      </div>
      <div className="skills-header-copy">
        <h1>技能</h1>
        <p>
          赋予 Codex 更强大的能力。
          <button type="button" className="skills-inline-link" onClick={() => void props.onOpenLearnMore()}>
            了解更多
          </button>
        </p>
      </div>
    </header>
  );
}

function InstalledSkillsSection(props: {
  readonly skills: ReadonlyArray<InstalledSkillCard>;
  readonly scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  readonly pendingPaths: Readonly<Record<string, boolean>>;
  readonly installedError: string | null;
  readonly actionError: string | null;
  readonly loading: boolean;
  readonly onToggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
}): JSX.Element {
  return (
    <section className="skills-section">
      <SectionHeading title="已安装" loading={props.loading} />
      <SectionBanner message={props.actionError} tone="error" />
      <SectionBanner message={formatScanErrors(props.scanErrors)} tone="warning" />
      <SkillsGridState
        emptyCopy="当前没有匹配的已安装技能。"
        error={props.installedError}
        items={props.skills}
        loading={props.loading}
        renderItem={(skill) => (
          <InstalledSkillCardView
            key={skill.path}
            pending={props.pendingPaths[skill.path] === true}
            skill={skill}
            onToggleSkillEnabled={props.onToggleSkillEnabled}
          />
        )}
      />
    </section>
  );
}

function RecommendedSkillsSection(props: {
  readonly skills: ReadonlyArray<RemoteSkillCard>;
  readonly installingIds: Readonly<Record<string, boolean>>;
  readonly error: string | null;
  readonly loading: boolean;
  readonly onInstallSkill: (skill: RemoteSkillCard) => Promise<void>;
}): JSX.Element {
  return (
    <section className="skills-section">
      <SectionHeading title="推荐" loading={props.loading} />
      <SkillsGridState
        emptyCopy="暂无推荐技能。"
        error={props.error}
        items={props.skills}
        loading={props.loading}
        renderItem={(skill) => (
          <RemoteSkillCardView
            key={skill.id}
            installing={props.installingIds[skill.id] === true}
            skill={skill}
            onInstallSkill={props.onInstallSkill}
          />
        )}
      />
    </section>
  );
}

function SkillsGridState<T>(props: {
  readonly items: ReadonlyArray<T>;
  readonly error: string | null;
  readonly loading: boolean;
  readonly emptyCopy: string;
  readonly renderItem: (item: T) => JSX.Element;
}): JSX.Element {
  if (props.error !== null) {
    return <SectionErrorState title="无法加载技能" detail={props.error} />;
  }
  if (props.loading && props.items.length === 0) {
    return <SectionEmptyState title="正在加载技能" detail="请稍候，正在通过官方链路获取最新技能数据。" />;
  }
  if (props.items.length === 0) {
    return <SectionEmptyState title="没有结果" detail={props.emptyCopy} />;
  }
  return <div className="skills-grid">{props.items.map(props.renderItem)}</div>;
}

function InstalledSkillCardView(props: {
  readonly skill: InstalledSkillCard;
  readonly pending: boolean;
  readonly onToggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
}): JSX.Element {
  return (
    <article className="skills-card" title={props.skill.path}>
      <SkillAvatar brandColor={props.skill.brandColor} icon={props.skill.icon} name={props.skill.name} />
      <div className="skills-card-copy">
        <div className="skills-card-title-row">
          <strong>{props.skill.name}</strong>
          <span className="skills-scope-pill">{formatScope(props.skill.scope)}</span>
        </div>
        <p>{props.skill.description}</p>
      </div>
      <button
        type="button"
        className={props.skill.enabled ? "settings-toggle settings-toggle-on" : "settings-toggle"}
        role="switch"
        aria-checked={props.skill.enabled}
        aria-label={`${props.skill.name}${props.skill.enabled ? "已启用" : "已禁用"}`}
        disabled={props.pending}
        onClick={() => void props.onToggleSkillEnabled(props.skill)}
      >
        <span className="settings-toggle-knob" />
      </button>
    </article>
  );
}

function RemoteSkillCardView(props: {
  readonly skill: RemoteSkillCard;
  readonly installing: boolean;
  readonly onInstallSkill: (skill: RemoteSkillCard) => Promise<void>;
}): JSX.Element {
  return (
    <article className="skills-card skills-card-remote">
      <SkillAvatar brandColor={null} icon={null} name={props.skill.name} />
      <div className="skills-card-copy">
        <strong>{props.skill.name}</strong>
        <p>{props.skill.description}</p>
      </div>
      <button
        type="button"
        className="skills-install-button"
        disabled={props.installing}
        onClick={() => void props.onInstallSkill(props.skill)}
      >
        {props.installing ? "安装中" : "安装"}
      </button>
    </article>
  );
}

function SectionHeading(props: { readonly title: string; readonly loading: boolean }): JSX.Element {
  return (
    <div className="skills-section-heading">
      <h2>{props.title}</h2>
      {props.loading ? <span>同步中…</span> : null}
    </div>
  );
}

function SectionBanner(props: { readonly message: string | null; readonly tone: "error" | "warning" }): JSX.Element | null {
  if (props.message === null) {
    return null;
  }
  return <div className={`skills-banner skills-banner-${props.tone}`}>{props.message}</div>;
}

function SectionErrorState(props: { readonly title: string; readonly detail: string }): JSX.Element {
  return (
    <div className="skills-empty-state skills-error-state">
      <strong>{props.title}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function SectionEmptyState(props: { readonly title: string; readonly detail: string }): JSX.Element {
  return (
    <div className="skills-empty-state">
      <strong>{props.title}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function SearchIcon(): JSX.Element {
  return <span className="skills-toolbar-icon" aria-hidden="true">⌕</span>;
}

function RefreshIcon(): JSX.Element {
  return <span className="skills-toolbar-icon" aria-hidden="true">↻</span>;
}

function formatScope(scope: InstalledSkillCard["scope"]): string {
  if (scope === "repo") return "仓库";
  if (scope === "user") return "个人";
  if (scope === "system") return "系统";
  return "管理";
}

function formatScanErrors(scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>): string | null {
  if (scanErrors.length === 0) {
    return null;
  }
  const [firstError] = scanErrors;
  if (scanErrors.length === 1) {
    return `扫描错误：${firstError.path} - ${firstError.message}`;
  }
  return `扫描错误：${firstError.path} - ${firstError.message}，另有 ${scanErrors.length - 1} 条。`;
}
