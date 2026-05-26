import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../../i18n";
import type { HooksListEntry } from "../../../protocol/generated/v2/HooksListEntry";
import type { HooksListResponse } from "../../../protocol/generated/v2/HooksListResponse";
import type { HookHandlerType } from "../../../protocol/generated/v2/HookHandlerType";
import type { HookMetadata } from "../../../protocol/generated/v2/HookMetadata";
import type { HookSource } from "../../../protocol/generated/v2/HookSource";
import type { HookTrustStatus } from "../../../protocol/generated/v2/HookTrustStatus";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";

interface HooksSettingsSectionProps {
  readonly ready: boolean;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRoot: WorkspaceRoot | null;
  listHooks: (cwds?: ReadonlyArray<string>) => Promise<HooksListResponse>;
  onOpenHooksDocs: () => Promise<void>;
}

interface HooksListState {
  readonly entries: ReadonlyArray<HooksListEntry>;
  readonly errorMessage: string | null;
  readonly loading: boolean;
  refresh: () => Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createHooksListCwds(
  roots: ReadonlyArray<WorkspaceRoot>,
  selectedRoot: WorkspaceRoot | null,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const cwds: string[] = [];
  for (const path of [selectedRoot?.path, ...roots.map((root) => root.path)]) {
    const normalized = path?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    cwds.push(normalized);
  }
  return cwds;
}

function compareHookOrder(left: HookMetadata, right: HookMetadata): number {
  const leftOrder = Number(left.displayOrder);
  const rightOrder = Number(right.displayOrder);
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.key.localeCompare(right.key);
}

function formatInteger(value: bigint | number | string): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

function truncateHash(hash: string): string {
  return hash.length <= 12 ? hash : `${hash.slice(0, 12)}...`;
}

function isAllMatcher(matcher: string | null): boolean {
  return matcher === null || matcher.trim() === "" || matcher.trim() === "*";
}

function eventNameLabel(eventName: HookMetadata["eventName"]): string {
  if (eventName === "preToolUse") return "PreToolUse";
  if (eventName === "permissionRequest") return "PermissionRequest";
  if (eventName === "postToolUse") return "PostToolUse";
  if (eventName === "preCompact") return "PreCompact";
  if (eventName === "postCompact") return "PostCompact";
  if (eventName === "sessionStart") return "SessionStart";
  if (eventName === "userPromptSubmit") return "UserPromptSubmit";
  if (eventName === "subagentStart") return "SubagentStart";
  if (eventName === "subagentStop") return "SubagentStop";
  return "Stop";
}

function useHooksListState(props: {
  readonly ready: boolean;
  readonly cwds: ReadonlyArray<string>;
  listHooks: (cwds?: ReadonlyArray<string>) => Promise<HooksListResponse>;
}): HooksListState {
  const { cwds, listHooks, ready } = props;
  const [entries, setEntries] = useState<ReadonlyArray<HooksListEntry>>([]);
  const [loading, setLoading] = useState(ready);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const cwdsKey = cwds.join("\n");

  const refresh = useCallback(async () => {
    if (!ready) {
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await listHooks(cwds.length === 0 ? undefined : cwds);
      if (requestIdRef.current === requestId) {
        setEntries(response.data);
      }
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setEntries([]);
        setErrorMessage(toErrorMessage(error));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [cwdsKey, listHooks, ready]);

  useEffect(() => {
    if (!ready) {
      requestIdRef.current += 1;
      setEntries([]);
      setErrorMessage(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [ready, refresh]);

  return { entries, errorMessage, loading, refresh };
}

function RefreshIcon(): JSX.Element {
  return (
    <svg className="settings-placeholder-action-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M12.6 7.1a4.7 4.7 0 0 0-8.1-2.8L3.3 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.2 2.7v2.9h2.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 8.9a4.7 4.7 0 0 0 8.1 2.8l1.2-1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.8 13.3v-2.9H9.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SourceLabel(props: { readonly source: HookSource }): JSX.Element {
  const { t } = useI18n();
  const label = (() => {
    if (props.source === "system") return t("settings.hooks.source.system");
    if (props.source === "user") return t("settings.hooks.source.user");
    if (props.source === "project") return t("settings.hooks.source.project");
    if (props.source === "mdm") return t("settings.hooks.source.mdm");
    if (props.source === "sessionFlags") return t("settings.hooks.source.sessionFlags");
    if (props.source === "plugin") return t("settings.hooks.source.plugin");
    if (props.source === "cloudRequirements") return t("settings.hooks.source.cloudRequirements");
    if (props.source === "legacyManagedConfigFile") return t("settings.hooks.source.legacyManagedConfigFile");
    if (props.source === "legacyManagedConfigMdm") return t("settings.hooks.source.legacyManagedConfigMdm");
    return t("settings.hooks.source.unknown");
  })();
  return <span>{label}</span>;
}

function TrustStatusBadge(props: { readonly status: HookTrustStatus }): JSX.Element {
  const { t } = useI18n();
  const label = (() => {
    if (props.status === "managed") return t("settings.hooks.trust.managed");
    if (props.status === "trusted") return t("settings.hooks.trust.trusted");
    if (props.status === "modified") return t("settings.hooks.trust.modified");
    return t("settings.hooks.trust.untrusted");
  })();
  const className = [
    "settings-hook-badge",
    `settings-hook-badge-${props.status}`,
  ].join(" ");
  return <span className={className}>{label}</span>;
}

function handlerTypeLabel(handlerType: HookHandlerType, t: ReturnType<typeof useI18n>["t"]): string {
  if (handlerType === "command") {
    return t("settings.hooks.handler.command");
  }
  if (handlerType === "prompt") {
    return t("settings.hooks.handler.prompt");
  }
  return t("settings.hooks.handler.agent");
}

function HookDetail(props: { readonly label: string; readonly children: ReactNode }): JSX.Element {
  return (
    <div className="settings-hook-detail">
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function HookRow(props: { readonly hook: HookMetadata }): JSX.Element {
  const { t } = useI18n();
  const hook = props.hook;
  const matcher = isAllMatcher(hook.matcher) ? t("settings.hooks.matcherAll") : hook.matcher;

  return (
    <div className="settings-hook-row">
      <div className="settings-hook-row-main">
        <div className="settings-hook-row-title">
          <strong>{eventNameLabel(hook.eventName)}</strong>
          <span className={hook.enabled ? "settings-hook-badge settings-hook-badge-enabled" : "settings-hook-badge settings-hook-badge-disabled"}>
            {hook.enabled ? t("settings.hooks.enabled") : t("settings.hooks.disabled")}
          </span>
          {hook.isManaged ? <span className="settings-hook-badge settings-hook-badge-managed">{t("settings.hooks.managed")}</span> : null}
          <TrustStatusBadge status={hook.trustStatus} />
        </div>
        {hook.statusMessage ? <p className="settings-hook-status-message">{hook.statusMessage}</p> : null}
        <dl className="settings-hook-details">
          <HookDetail label={t("settings.hooks.matcher")}>{matcher}</HookDetail>
          <HookDetail label={t("settings.hooks.handlerLabel")}>{handlerTypeLabel(hook.handlerType, t)}</HookDetail>
          <HookDetail label={t("settings.hooks.timeout")}>{t("settings.hooks.timeoutSeconds", { seconds: formatInteger(hook.timeoutSec) })}</HookDetail>
          <HookDetail label={t("settings.hooks.sourceLabel")}>
            <SourceLabel source={hook.source} />
          </HookDetail>
          {hook.pluginId ? <HookDetail label={t("settings.hooks.plugin")}>{hook.pluginId}</HookDetail> : null}
          <HookDetail label={t("settings.hooks.sourcePath")}>
            <code>{hook.sourcePath}</code>
          </HookDetail>
          <HookDetail label={t("settings.hooks.hash")}>
            <code>{truncateHash(hook.currentHash)}</code>
          </HookDetail>
        </dl>
        <div className="settings-hook-command">
          <span>{t("settings.hooks.command")}</span>
          <code>{hook.command ?? t("settings.hooks.noCommand")}</code>
        </div>
      </div>
    </div>
  );
}

function HookDiagnostics(props: { readonly entry: HooksListEntry }): JSX.Element | null {
  const { t } = useI18n();
  if (props.entry.warnings.length === 0 && props.entry.errors.length === 0) {
    return null;
  }

  return (
    <div className="settings-hook-diagnostics">
      {props.entry.warnings.length > 0 ? (
        <div className="settings-hook-diagnostic-group">
          <strong>{t("settings.hooks.warnings")}</strong>
          {props.entry.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
      {props.entry.errors.length > 0 ? (
        <div className="settings-hook-diagnostic-group settings-hook-diagnostic-group-error">
          <strong>{t("settings.hooks.errors")}</strong>
          {props.entry.errors.map((error) => (
            <p key={`${error.path}:${error.message}`}>
              <code>{error.path}</code>
              {" - "}
              {error.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HooksWorkspaceSection(props: { readonly entry: HooksListEntry }): JSX.Element {
  const { t } = useI18n();
  const hooks = useMemo(() => [...props.entry.hooks].sort(compareHookOrder), [props.entry.hooks]);
  const diagnosticsCount = props.entry.warnings.length + props.entry.errors.length;

  return (
    <section className="settings-card settings-hooks-workspace-card">
      <div className="settings-section-head settings-hooks-workspace-head">
        <div className="settings-hooks-workspace-title">
          <strong>{props.entry.cwd || t("settings.hooks.defaultCwd")}</strong>
          <span>{t("settings.hooks.workspaceSummary", { hooks: String(hooks.length), diagnostics: String(diagnosticsCount) })}</span>
        </div>
      </div>
      <HookDiagnostics entry={props.entry} />
      {hooks.length === 0 ? (
        <div className="settings-empty">{t("settings.hooks.emptyWorkspace")}</div>
      ) : hooks.map((hook) => <HookRow key={`${hook.key}:${formatInteger(hook.displayOrder)}`} hook={hook} />)}
    </section>
  );
}

export function HooksSettingsSection(props: HooksSettingsSectionProps): JSX.Element {
  const { t } = useI18n();
  const cwds = useMemo(() => createHooksListCwds(props.roots, props.selectedRoot), [props.roots, props.selectedRoot]);
  const state = useHooksListState({
    ready: props.ready,
    cwds,
    listHooks: props.listHooks,
  });
  const totalHooks = state.entries.reduce((count, entry) => count + entry.hooks.length, 0);
  const totalDiagnostics = state.entries.reduce((count, entry) => count + entry.warnings.length + entry.errors.length, 0);
  const showEmpty = props.ready && !state.loading && state.errorMessage === null && totalHooks === 0 && totalDiagnostics === 0;

  return (
    <div className="settings-panel-group settings-hooks-page">
      <header className="settings-title-wrap settings-title-wrap-with-action">
        <div>
          <h1 className="settings-page-title">{t("settings.hooks.title")}</h1>
          <p className="settings-subtitle">
            {t("settings.hooks.subtitle")}{" "}
            <button type="button" className="settings-hooks-doc-link" onClick={() => void props.onOpenHooksDocs()}>
              {t("settings.hooks.learnMore")}
            </button>
          </p>
        </div>
        <button
          type="button"
          className="settings-placeholder-icon-button settings-hooks-refresh-button"
          aria-label={t("settings.hooks.refreshAction")}
          onClick={() => void state.refresh()}
          disabled={!props.ready || state.loading}
        >
          <RefreshIcon />
        </button>
      </header>

      <section className="settings-card settings-hooks-overview-card">
        <div className="settings-hooks-overview-grid">
          <div>
            <strong>{String(totalHooks)}</strong>
            <span>{t("settings.hooks.configuredHooks")}</span>
          </div>
          <div>
            <strong>{String(state.entries.length)}</strong>
            <span>{t("settings.hooks.workspaces")}</span>
          </div>
          <div>
            <strong>{String(totalDiagnostics)}</strong>
            <span>{t("settings.hooks.diagnostics")}</span>
          </div>
        </div>
        <p className="settings-note settings-note-pad">{t("settings.hooks.reviewNote")}</p>
      </section>

      {!props.ready ? <section className="settings-card"><div className="settings-empty">{t("settings.hooks.initializing")}</div></section> : null}
      {state.errorMessage ? <p className="settings-status-note settings-status-note-error">{t("settings.hooks.loadFailed", { error: state.errorMessage })}</p> : null}
      {state.loading ? <section className="settings-card"><div className="settings-empty">{t("settings.hooks.loading")}</div></section> : null}
      {showEmpty ? (
        <section className="settings-card settings-hooks-placeholder-card">
          <div className="settings-placeholder-stack">
            <strong>{t("settings.hooks.emptyTitle")}</strong>
            <span>{t("settings.hooks.emptyDescription")}</span>
          </div>
        </section>
      ) : null}
      {!state.loading && state.errorMessage === null
        ? state.entries.map((entry) => <HooksWorkspaceSection key={entry.cwd || "default-cwd"} entry={entry} />)
        : null}
    </div>
  );
}
