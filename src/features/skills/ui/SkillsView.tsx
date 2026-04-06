import type { ReceivedNotification } from "../../../domain/types";
import type { AuthMode } from "../../../protocol/generated/AuthMode";
import type { PluginInstallParams } from "../../../protocol/generated/v2/PluginInstallParams";
import type { PluginInstallResponse } from "../../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListParams } from "../../../protocol/generated/v2/PluginListParams";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
import type { SkillsConfigWriteParams } from "../../../protocol/generated/v2/SkillsConfigWriteParams";
import type { SkillsConfigWriteResponse } from "../../../protocol/generated/v2/SkillsConfigWriteResponse";
import type { SkillsListParams } from "../../../protocol/generated/v2/SkillsListParams";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import { useI18n } from "../../../i18n";
import "../../../styles/replica/replica-skills.css";
import { useSkillsViewModel } from "../hooks/useSkillsViewModel";
import type { InstalledSkillCard, MarketplacePluginCard } from "../model/skillCatalog";
import { SkillAvatar } from "./SkillAvatar";

export interface SkillsViewProps {
  readonly authStatus: "unknown" | "authenticated" | "needs_login";
  readonly authMode: AuthMode | null;
  readonly ready?: boolean;
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly onBackHome: () => void;
  readonly onOpenLearnMore: () => Promise<void>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
}

export function SkillsView(props: SkillsViewProps): JSX.Element {
  const model = useSkillsViewModel({
    authStatus: props.authStatus,
    authMode: props.authMode,
    ready: props.ready,
    selectedRootPath: props.selectedRootPath,
    notifications: props.notifications,
    listSkills: props.listSkills,
    listMarketplacePlugins: props.listMarketplacePlugins,
    writeSkillConfig: props.writeSkillConfig,
    installMarketplacePlugin: props.installMarketplacePlugin,
  });

  return (
    <div className="skills-page">
      <SkillsToolbar
        query={model.query}
        refreshPending={model.refreshPending}
        ready={props.ready !== false}
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
          onInstallSkill={model.installMarketplaceSkill}
        />
      </main>
    </div>
  );
}

function SkillsToolbar(props: {
  readonly query: string;
  readonly refreshPending: boolean;
  readonly ready: boolean;
  readonly onBackHome: () => void;
  readonly onOpenLearnMore: () => Promise<void>;
  readonly onRefresh: () => Promise<void>;
  readonly onQueryChange: (value: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <header className="skills-toolbar">
      <button type="button" className="skills-back-button" onClick={props.onBackHome}>
        {t("home.skills.back")}
      </button>
      <div className="skills-toolbar-actions">
        <button type="button" className="skills-ghost-button" onClick={() => void props.onRefresh()} disabled={!props.ready || props.refreshPending}>
          <RefreshIcon />
          <span>{props.refreshPending ? t("home.skills.refreshing") : t("home.skills.refresh")}</span>
        </button>
        <label className="skills-search-field">
          <SearchIcon />
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={t("home.skills.search")}
            aria-label={t("home.skills.search")}
          />
        </label>
        <button
          type="button"
          className="skills-primary-button"
          disabled
          title={t("home.skills.newSkillDisabled")}
        >
          {t("home.skills.newSkill")}
        </button>
      </div>
      <div className="skills-header-copy">
        <h1>{t("home.skills.title")}</h1>
        <p>
          {t("home.skills.subtitle")}
          <button type="button" className="skills-inline-link" onClick={() => void props.onOpenLearnMore()}>
            {t("home.skills.learnMore")}
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
  const { t } = useI18n();
  return (
    <section className="skills-section">
      <SectionHeading title={t("home.skills.installed.title")} loading={props.loading} />
      <SectionBanner message={props.actionError} tone="error" />
      <SectionBanner message={formatScanErrors(props.scanErrors, t)} tone="warning" />
      <SkillsGridState
        emptyCopy={t("home.skills.installed.empty")}
        error={props.installedError}
        items={props.skills}
        loading={props.loading}
        t={t}
        renderItem={(skill) => (
          <InstalledSkillCardView
            key={skill.path}
            pending={props.pendingPaths[skill.path] === true}
            skill={skill}
            t={t}
            onToggleSkillEnabled={props.onToggleSkillEnabled}
          />
        )}
      />
    </section>
  );
}

function RecommendedSkillsSection(props: {
  readonly skills: ReadonlyArray<MarketplacePluginCard>;
  readonly installingIds: Readonly<Record<string, boolean>>;
  readonly error: string | null;
  readonly loading: boolean;
  readonly onInstallSkill: (skill: MarketplacePluginCard) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <section className="skills-section">
      <SectionHeading title={t("home.skills.recommended.title")} loading={props.loading} />
      <SkillsGridState
        emptyCopy={t("home.skills.recommended.empty")}
        error={props.error}
        items={props.skills}
        loading={props.loading}
        t={t}
        renderItem={(skill) => (
          <RemoteSkillCardView
            key={skill.id}
            installing={props.installingIds[skill.id] === true}
            skill={skill}
            t={t}
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
  readonly t: ReturnType<typeof useI18n>["t"];
  readonly renderItem: (item: T) => JSX.Element;
}): JSX.Element {
  if (props.error !== null) {
    return <SectionErrorState title={props.t("home.skills.installed.errorTitle")} detail={props.error} />;
  }
  if (props.loading && props.items.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.installed.loadingTitle")} detail={props.t("home.skills.installed.loadingDetail")} />;
  }
  if (props.items.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.empty")} detail={props.emptyCopy} />;
  }
  return <div className="skills-grid">{props.items.map(props.renderItem)}</div>;
}

function InstalledSkillCardView(props: {
  readonly skill: InstalledSkillCard;
  readonly pending: boolean;
  readonly t: ReturnType<typeof useI18n>["t"];
  readonly onToggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
}): JSX.Element {
  return (
    <article className="skills-card" title={props.skill.path}>
      <SkillAvatar brandColor={props.skill.brandColor} icon={props.skill.icon} name={props.skill.name} />
      <div className="skills-card-copy">
        <div className="skills-card-title-row">
          <strong>{props.skill.name}</strong>
          <span className="skills-scope-pill">{formatScope(props.skill.scope, props.t)}</span>
        </div>
        <p>{props.skill.description}</p>
      </div>
      <button
        type="button"
        className={props.skill.enabled ? "settings-toggle settings-toggle-on" : "settings-toggle"}
        role="switch"
        aria-checked={props.skill.enabled}
        aria-label={`${props.skill.name}${props.skill.enabled ? props.t("home.skills.card.enabled") : props.t("home.skills.card.disabled")}`}
        disabled={props.pending}
        onClick={() => void props.onToggleSkillEnabled(props.skill)}
      >
        <span className="settings-toggle-knob" />
      </button>
    </article>
  );
}

function RemoteSkillCardView(props: {
  readonly skill: MarketplacePluginCard;
  readonly installing: boolean;
  readonly t: ReturnType<typeof useI18n>["t"];
  readonly onInstallSkill: (skill: MarketplacePluginCard) => Promise<void>;
}): JSX.Element {
  return (
    <article className="skills-card skills-card-remote">
      <SkillAvatar brandColor={props.skill.brandColor} icon={props.skill.icon} name={props.skill.name} />
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
        {props.installing ? props.t("home.skills.card.installing") : props.t("home.skills.card.install")}
      </button>
    </article>
  );
}

function SectionHeading(props: { readonly title: string; readonly loading: boolean }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="skills-section-heading">
      <h2>{props.title}</h2>
      {props.loading ? <span>{t("home.skills.installed.syncing")}</span> : null}
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

function formatScope(scope: InstalledSkillCard["scope"], t: ReturnType<typeof useI18n>["t"]): string {
  if (scope === "repo") return t("home.skills.card.scopeRepo");
  if (scope === "user") return t("home.skills.card.scopePersonal");
  if (scope === "system") return t("home.skills.card.scopeSystem");
  return t("home.skills.card.scopeAdmin");
}

function formatScanErrors(
  scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  if (scanErrors.length === 0) {
    return null;
  }
  const [firstError] = scanErrors;
  if (scanErrors.length === 1) {
    return t("home.skills.scan.error", { path: firstError.path, message: firstError.message });
  }
  return t("home.skills.scan.errorMultiple", { path: firstError.path, message: firstError.message, count: scanErrors.length - 1 });
}
