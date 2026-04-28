import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BrowserUseApprovalMode,
  BrowserUseOriginKind,
  BrowserUseSettingsOutput,
} from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

interface BrowserUseSettingsSectionProps {
  readonly readBrowserUseSettings: () => Promise<BrowserUseSettingsOutput>;
  readonly writeBrowserUseApprovalMode: (
    input: { readonly approvalMode: BrowserUseApprovalMode },
  ) => Promise<BrowserUseSettingsOutput>;
  readonly addBrowserUseOrigin: (
    input: { readonly kind: BrowserUseOriginKind; readonly origin: string },
  ) => Promise<BrowserUseSettingsOutput>;
  readonly removeBrowserUseOrigin: (
    input: { readonly kind: BrowserUseOriginKind; readonly origin: string },
  ) => Promise<BrowserUseSettingsOutput>;
  readonly clearBrowserBrowsingData: () => Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function BrowserUsePluginIcon(): JSX.Element {
  return (
    <span className="browser-use-plugin-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M4.2 4.8c4.6-.7 8.6.7 12 4.2 1.5 1.5 2.7 3.2 3.6 5.1-2 .4-3.8 1.2-5.4 2.4-1.8 1.3-3.1 3-3.9 5-2.9-3.2-4.7-6.6-5.5-10.1-.5-2.3-.8-4.5-.8-6.6Z" />
        <path d="M7.4 7.2c2.5.3 4.8 1.4 6.7 3.3 1 1 1.8 2.1 2.5 3.4-2.5.8-4.5 2.4-6 4.8-1.8-2.6-2.9-5.1-3.4-7.6-.2-1.2-.2-2.5.2-3.9Z" />
      </svg>
    </span>
  );
}

function OriginList(props: {
  readonly title: string;
  readonly description: string;
  readonly emptyText: string;
  readonly kind: BrowserUseOriginKind;
  readonly origins: ReadonlyArray<string>;
  readonly draft: string;
  readonly pending: boolean;
  readonly onDraftChange: (value: string) => void;
  readonly onAdd: (kind: BrowserUseOriginKind) => void;
  readonly onRemove: (kind: BrowserUseOriginKind, origin: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <section className="browser-use-domain-block">
      <div className="browser-use-domain-heading">
        <div>
          <strong>{props.title}</strong>
          <p>{props.description}</p>
        </div>
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
            placeholder={t("settings.browserUse.originPlaceholder")}
            disabled={props.pending}
            onChange={(event) => props.onDraftChange(event.currentTarget.value)}
          />
          <button type="submit" disabled={props.pending || props.draft.trim().length === 0}>
            {t("settings.browserUse.add")}
          </button>
        </form>
      </div>
      {props.origins.length === 0 ? (
        <div className="browser-use-empty-domain-list">{props.emptyText}</div>
      ) : (
        <ul className="browser-use-domain-list" aria-label={props.title}>
          {props.origins.map((origin) => (
            <li key={origin}>
              <span>{origin}</span>
              <button
                type="button"
                disabled={props.pending}
                onClick={() => props.onRemove(props.kind, origin)}
              >
                {t("settings.browserUse.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BrowserUseSettingsSection(
  props: BrowserUseSettingsSectionProps,
): JSX.Element {
  const { t } = useI18n();
  const [settings, setSettings] = useState<BrowserUseSettingsOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly tone: "error" | "success";
    readonly message: string;
  } | null>(null);
  const [allowedDraft, setAllowedDraft] = useState("");
  const [deniedDraft, setDeniedDraft] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFeedback(null);
    void props.readBrowserUseSettings()
      .then((output) => {
        if (active) {
          setSettings(output);
        }
      })
      .catch((error) => {
        if (active) {
          setFeedback({
            tone: "error",
            message: t("settings.browserUse.loadFailed", {
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

  const approvalOptions = useMemo<ReadonlyArray<SettingsSelectOption<BrowserUseApprovalMode>>>(
    () => [
      { value: "alwaysAsk", label: t("settings.browserUse.approvalOptions.alwaysAsk") },
      { value: "neverAsk", label: t("settings.browserUse.approvalOptions.neverAsk") },
    ],
    [t],
  );

  const changeApprovalMode = useCallback(async (approvalMode: BrowserUseApprovalMode) => {
    setPending(true);
    setFeedback(null);
    try {
      const next = await props.writeBrowserUseApprovalMode({ approvalMode });
      setSettings(next);
      setFeedback({ tone: "success", message: t("settings.browserUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.browserUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [props, t]);

  const addOrigin = useCallback(async (kind: BrowserUseOriginKind) => {
    const draft = kind === "allowed" ? allowedDraft : deniedDraft;
    if (draft.trim().length === 0) {
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const next = await props.addBrowserUseOrigin({ kind, origin: draft });
      setSettings(next);
      if (kind === "allowed") {
        setAllowedDraft("");
      } else {
        setDeniedDraft("");
      }
      setFeedback({ tone: "success", message: t("settings.browserUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.browserUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [allowedDraft, deniedDraft, props, t]);

  const removeOrigin = useCallback(async (
    kind: BrowserUseOriginKind,
    origin: string,
  ) => {
    setPending(true);
    setFeedback(null);
    try {
      const next = await props.removeBrowserUseOrigin({ kind, origin });
      setSettings(next);
      setFeedback({ tone: "success", message: t("settings.browserUse.saved") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.browserUse.saveFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [props, t]);

  const clearBrowsingData = useCallback(async () => {
    setPending(true);
    setFeedback(null);
    try {
      await props.clearBrowserBrowsingData();
      setFeedback({ tone: "success", message: t("settings.browserUse.cookiesCleared") });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("settings.browserUse.clearFailed", { error: toErrorMessage(error) }),
      });
    } finally {
      setPending(false);
    }
  }, [props, t]);

  const currentSettings = settings ?? {
    approvalMode: "alwaysAsk" as const,
    allowedOrigins: [],
    deniedOrigins: [],
  };

  return (
    <div className="settings-panel-group browser-use-settings-page">
      <section className="settings-page-section">
        <h2 className="settings-section-title">{t("settings.browserUse.title")}</h2>

        <div className="browser-use-section-label">{t("settings.browserUse.pluginSection")}</div>
        <section className="settings-card browser-use-plugin-card">
          <div className="settings-row">
            <div className="browser-use-plugin-copy">
              <BrowserUsePluginIcon />
              <div>
                <strong>Browser Use</strong>
                <p>{t("settings.browserUse.pluginDescription")}</p>
              </div>
            </div>
            <div className="settings-row-control">
              <span className="browser-use-enabled-mark" aria-label={t("settings.browserUse.enabled")}>
                ✓
              </span>
            </div>
          </div>
        </section>

        <div className="browser-use-section-label">{t("settings.browserUse.browsingDataSection")}</div>
        <section className="settings-card settings-config-card">
          <div className="settings-row">
            <div className="settings-row-copy">
              <div className="settings-row-heading">{t("settings.browserUse.cookiesLabel")}</div>
              <p className="settings-row-meta">{t("settings.browserUse.cookiesDescription")}</p>
            </div>
            <div className="settings-row-control">
              <button
                type="button"
                className="settings-action-btn settings-action-btn-sm"
                disabled={pending}
                onClick={() => void clearBrowsingData()}
              >
                {t("settings.browserUse.clearCookies")}
              </button>
            </div>
          </div>
        </section>

        <div className="browser-use-section-label">{t("settings.browserUse.permissionsSection")}</div>
        <section className="settings-card">
          <SettingsSelectRow
            label={t("settings.browserUse.approvalLabel")}
            description={t("settings.browserUse.approvalDescription")}
            value={currentSettings.approvalMode}
            options={approvalOptions}
            disabled={loading || pending}
            onChange={(approvalMode) => void changeApprovalMode(approvalMode)}
          />
        </section>

        <OriginList
          title={t("settings.browserUse.deniedOriginsTitle")}
          description={t("settings.browserUse.deniedOriginsDescription")}
          emptyText={t("settings.browserUse.deniedOriginsEmpty")}
          kind="denied"
          origins={currentSettings.deniedOrigins}
          draft={deniedDraft}
          pending={loading || pending}
          onDraftChange={setDeniedDraft}
          onAdd={(kind) => void addOrigin(kind)}
          onRemove={(kind, origin) => void removeOrigin(kind, origin)}
        />

        <OriginList
          title={t("settings.browserUse.allowedOriginsTitle")}
          description={t("settings.browserUse.allowedOriginsDescription")}
          emptyText={t("settings.browserUse.allowedOriginsEmpty")}
          kind="allowed"
          origins={currentSettings.allowedOrigins}
          draft={allowedDraft}
          pending={loading || pending}
          onDraftChange={setAllowedDraft}
          onAdd={(kind) => void addOrigin(kind)}
          onRemove={(kind, origin) => void removeOrigin(kind, origin)}
        />

        {loading ? (
          <p className="settings-status-note">{t("settings.browserUse.loading")}</p>
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
