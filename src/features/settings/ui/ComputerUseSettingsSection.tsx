import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ComputerUseAppKind,
  ComputerUseApprovalMode,
  ComputerUseSettingsOutput,
} from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import { OfficialPlusIcon } from "../../shared/ui/officialIcons";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

const ALLOWED_APP_SUGGESTIONS = ["notepad", "code", "chrome", "msedge"] as const;
const DENIED_APP_SUGGESTIONS = [
  "powershell",
  "pwsh",
  "cmd",
  "wt",
  "windowsterminal",
  "diskmgmt",
  "diskpart",
  "regedit",
  "mmc",
  "taskmgr",
  "bitwarden",
  "1password",
] as const;

interface ComputerUseSettingsSectionProps {
  readonly readComputerUseSettings: () => Promise<ComputerUseSettingsOutput>;
  readonly onOpenConfigToml: (filePath?: string | null) => Promise<void>;
  readonly writeComputerUseApprovalMode: (
    input: { readonly approvalMode: ComputerUseApprovalMode },
  ) => Promise<ComputerUseSettingsOutput>;
  readonly addComputerUseApp: (
    input: { readonly kind: ComputerUseAppKind; readonly app: string },
  ) => Promise<ComputerUseSettingsOutput>;
  readonly removeComputerUseApp: (
    input: { readonly kind: ComputerUseAppKind; readonly app: string },
  ) => Promise<ComputerUseSettingsOutput>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasAppName(apps: ReadonlyArray<string>, appName: string): boolean {
  return apps.some((app) => app.toLowerCase() === appName.toLowerCase());
}

function ComputerUsePluginIcon(): JSX.Element {
  return (
    <span className="browser-use-plugin-icon computer-use-plugin-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="11" rx="2.2" />
        <path d="M9 20h6l-.7-4H9.7Z" />
        <path d="M8.4 10.2 11 12.5l-2.6 2.3 1.1 1 3.7-3.3-3.7-3.3Z" />
        <path d="M13.4 14.8h3.2v1.4h-3.2Z" />
      </svg>
    </span>
  );
}

function AppList(props: {
  readonly title: string;
  readonly description: string;
  readonly emptyText: string;
  readonly kind: ComputerUseAppKind;
  readonly apps: ReadonlyArray<string>;
  readonly draft: string;
  readonly adding: boolean;
  readonly suggestions: ReadonlyArray<string>;
  readonly pending: boolean;
  readonly recommendedActionLabel?: string;
  readonly onRecommendedAction?: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onStartAdd: (kind: ComputerUseAppKind) => void;
  readonly onAdd: (kind: ComputerUseAppKind) => void;
  readonly onAddSuggestion: (kind: ComputerUseAppKind, app: string) => void;
  readonly onRemove: (kind: ComputerUseAppKind, app: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const visibleSuggestions = props.suggestions.filter(
    (suggestion) => !hasAppName(props.apps, suggestion),
  );
  return (
    <section className="browser-use-domain-block">
      <div className="browser-use-domain-heading">
        <div>
          <strong>{props.title}</strong>
          <p>{props.description}</p>
        </div>
        <div className="browser-use-domain-actions">
          {props.recommendedActionLabel !== undefined && props.onRecommendedAction !== undefined ? (
            <button
              type="button"
              className="settings-action-btn settings-action-btn-sm"
              disabled={props.pending}
              onClick={props.onRecommendedAction}
            >
              {props.recommendedActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="browser-use-domain-add-button"
            disabled={props.pending}
            onClick={() => props.onStartAdd(props.kind)}
          >
            <OfficialPlusIcon className="browser-use-domain-add-icon" />
            <span>{t("settings.computerUse.add")}</span>
          </button>
        </div>
      </div>
      {props.adding ? (
        <form
          className="browser-use-domain-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onAdd(props.kind);
          }}
        >
          <input
            type="text"
            value={props.draft}
            placeholder={t("settings.computerUse.appPlaceholder")}
            disabled={props.pending}
            autoFocus
            onChange={(event) => props.onDraftChange(event.currentTarget.value)}
          />
          <button type="submit" disabled={props.pending || props.draft.trim().length === 0}>
            {t("settings.computerUse.add")}
          </button>
        </form>
      ) : null}
      {visibleSuggestions.length > 0 ? (
        <div className="computer-use-app-suggestions">
          <span>{t("settings.computerUse.quickAdd")}</span>
          {visibleSuggestions.map((app) => (
            <button
              key={app}
              type="button"
              disabled={props.pending}
              onClick={() => props.onAddSuggestion(props.kind, app)}
            >
              {app}
            </button>
          ))}
        </div>
      ) : null}
      {props.apps.length === 0 ? (
        <div className="browser-use-empty-domain-list">{props.emptyText}</div>
      ) : (
        <ul className="browser-use-domain-list" aria-label={props.title}>
          {props.apps.map((app) => (
            <li key={app}>
              <span>{app}</span>
              <button
                type="button"
                disabled={props.pending}
                onClick={() => props.onRemove(props.kind, app)}
              >
                {t("settings.computerUse.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ComputerUseSettingsSection(
  props: ComputerUseSettingsSectionProps,
): JSX.Element {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ComputerUseSettingsOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly tone: "error" | "success";
    readonly message: string;
  } | null>(null);
  const [activeAppForm, setActiveAppForm] = useState<ComputerUseAppKind | null>(null);
  const [allowedDraft, setAllowedDraft] = useState("");
  const [deniedDraft, setDeniedDraft] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFeedback(null);
    void props.readComputerUseSettings()
      .then((output) => {
        if (active) {
          setSettings(output);
        }
      })
      .catch((error) => {
        if (active) {
          setFeedback({
            tone: "error",
            message: t("settings.computerUse.loadFailed", {
              error: toErrorMessage(error),
            }),
          });
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [props, t]);

  const approvalOptions = useMemo<ReadonlyArray<SettingsSelectOption<ComputerUseApprovalMode>>>(
    () => [
      {
        value: "allowVisible",
        label: t("settings.computerUse.approvalOptions.allowVisible"),
      },
      {
        value: "requireApprovals",
        label: t("settings.computerUse.approvalOptions.requireApprovals"),
      },
    ],
    [t],
  );

  const changeApprovalMode = useCallback(async (approvalMode: ComputerUseApprovalMode) => {
    setPending(true);
    setFeedback(null);
    try {
      const next = await props.writeComputerUseApprovalMode({ approvalMode });
      setSettings(next);
      setFeedback({ tone: "success", message: t("settings.computerUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.computerUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [props, t]);

  const submitApp = useCallback(async (kind: ComputerUseAppKind, app: string) => {
    const trimmed = app.trim();
    if (trimmed.length === 0) {
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const next = await props.addComputerUseApp({ kind, app: trimmed });
      setSettings(next);
      if (kind === "allowed") {
        setAllowedDraft("");
      } else {
        setDeniedDraft("");
      }
      setActiveAppForm(null);
      setFeedback({ tone: "success", message: t("settings.computerUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.computerUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [props, t]);

  const addApp = useCallback((kind: ComputerUseAppKind) => {
    const draft = kind === "allowed" ? allowedDraft : deniedDraft;
    void submitApp(kind, draft);
  }, [allowedDraft, deniedDraft, submitApp]);

  const addSuggestedApp = useCallback((kind: ComputerUseAppKind, app: string) => {
    void submitApp(kind, app);
  }, [submitApp]);

  const removeApp = useCallback(async (
    kind: ComputerUseAppKind,
    app: string,
  ) => {
    setPending(true);
    setFeedback(null);
    try {
      const next = await props.removeComputerUseApp({ kind, app });
      setSettings(next);
      setFeedback({ tone: "success", message: t("settings.computerUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.computerUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [props, t]);

  const currentSettings = settings ?? {
    configPath: "~/.codex/computer-use/config.toml",
    approvalMode: "allowVisible" as const,
    allowedApps: [],
    deniedApps: [],
  };
  const missingRecommendedDeniedApps = useMemo(
    () => DENIED_APP_SUGGESTIONS.filter(
      (app) => !hasAppName(currentSettings.deniedApps, app),
    ),
    [currentSettings.deniedApps],
  );
  const policyDescription = currentSettings.allowedApps.length > 0
    ? t("settings.computerUse.policyAllowlistMode")
    : currentSettings.approvalMode === "requireApprovals"
      ? t("settings.computerUse.policyRequireApprovalsMode")
      : t("settings.computerUse.policyDefaultMode");

  const applyRecommendedDeniedApps = useCallback(async () => {
    if (missingRecommendedDeniedApps.length === 0) {
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      let next: ComputerUseSettingsOutput | null = null;
      for (const app of missingRecommendedDeniedApps) {
        next = await props.addComputerUseApp({ kind: "denied", app });
      }
      if (next !== null) {
        setSettings(next);
      }
      setDeniedDraft("");
      setActiveAppForm(null);
      setFeedback({ tone: "success", message: t("settings.computerUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.computerUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [missingRecommendedDeniedApps, props, t]);

  const openConfigToml = useCallback(() => {
    void props.onOpenConfigToml(currentSettings.configPath);
  }, [currentSettings.configPath, props]);

  return (
    <div className="settings-panel-group browser-use-settings-page computer-use-settings-page">
      <section className="settings-page-section">
        <h1 className="settings-page-title browser-use-page-title">{t("settings.computerUse.title")}</h1>

        <section className="browser-use-settings-section">
          <div className="browser-use-section-label">{t("settings.computerUse.pluginSection")}</div>
          <section className="settings-card browser-use-plugin-card">
            <div className="settings-row">
              <div className="browser-use-plugin-copy">
                <ComputerUsePluginIcon />
                <div>
                  <strong>Computer Use</strong>
                  <p>{t("settings.computerUse.pluginDescription")}</p>
                </div>
              </div>
              <div className="settings-row-control">
                <span className="browser-use-enabled-mark" aria-label={t("settings.computerUse.enabled")}>
                  ✓
                </span>
              </div>
            </div>
          </section>
        </section>

        <section className="browser-use-settings-section">
          <div className="browser-use-section-label">{t("settings.computerUse.policySection")}</div>
          <section className="settings-card settings-config-card browser-use-data-card">
            <div className="settings-row">
              <div className="settings-row-copy">
                <div className="settings-row-heading">{t("settings.computerUse.policyLabel")}</div>
                <p className="settings-row-meta">{policyDescription}</p>
                <p className="settings-row-meta computer-use-config-path">
                  {t("settings.computerUse.configPath", { path: currentSettings.configPath })}
                </p>
              </div>
              <div className="settings-row-control">
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn-sm"
                  disabled={loading}
                  onClick={openConfigToml}
                >
                  {t("settings.computerUse.openConfig")}
                </button>
              </div>
            </div>
          </section>
        </section>

        <section className="browser-use-settings-section">
          <div className="browser-use-section-label">{t("settings.computerUse.permissionsSection")}</div>
          <section className="settings-card browser-use-permissions-card">
            <SettingsSelectRow
              label={t("settings.computerUse.approvalLabel")}
              description={t("settings.computerUse.approvalDescription")}
              value={currentSettings.approvalMode}
              options={approvalOptions}
              disabled={loading || pending}
              onChange={(approvalMode) => void changeApprovalMode(approvalMode)}
            />
          </section>
        </section>

        <AppList
          title={t("settings.computerUse.deniedAppsTitle")}
          description={t("settings.computerUse.deniedAppsDescription")}
          emptyText={t("settings.computerUse.deniedAppsEmpty")}
          kind="denied"
          apps={currentSettings.deniedApps}
          suggestions={DENIED_APP_SUGGESTIONS}
          draft={deniedDraft}
          adding={activeAppForm === "denied"}
          pending={loading || pending}
          recommendedActionLabel={
            missingRecommendedDeniedApps.length > 0
              ? t("settings.computerUse.blockShellApps")
              : undefined
          }
          onRecommendedAction={
            missingRecommendedDeniedApps.length > 0
              ? () => void applyRecommendedDeniedApps()
              : undefined
          }
          onDraftChange={setDeniedDraft}
          onStartAdd={setActiveAppForm}
          onAdd={addApp}
          onAddSuggestion={addSuggestedApp}
          onRemove={(kind, app) => void removeApp(kind, app)}
        />

        <AppList
          title={t("settings.computerUse.allowedAppsTitle")}
          description={t("settings.computerUse.allowedAppsDescription")}
          emptyText={t("settings.computerUse.allowedAppsEmpty")}
          kind="allowed"
          apps={currentSettings.allowedApps}
          suggestions={ALLOWED_APP_SUGGESTIONS}
          draft={allowedDraft}
          adding={activeAppForm === "allowed"}
          pending={loading || pending}
          onDraftChange={setAllowedDraft}
          onStartAdd={setActiveAppForm}
          onAdd={addApp}
          onAddSuggestion={addSuggestedApp}
          onRemove={(kind, app) => void removeApp(kind, app)}
        />

        {loading ? (
          <p className="settings-status-note">{t("settings.computerUse.loading")}</p>
        ) : null}
        {feedback !== null ? (
          <p
            className={
              feedback.tone === "error"
                ? "settings-status-note settings-status-note-error"
                : "settings-status-note settings-status-note-success"
            }
          >
            {feedback.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
