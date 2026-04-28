import { useMemo, useState } from "react";
import { ComposerModelControls } from "../../composer/ui/ComposerModelControls";
import {
  findComposerModel,
  resolveComposerEffort,
  type ComposerModelOption,
  type ComposerSelection,
} from "../../composer/model/composerPreferences";
import type { AutomationsController } from "../hooks/useAutomations";
import {
  AUTOMATION_SECTIONS,
  DEFAULT_AUTOMATION_SCHEDULE,
  formatAutomationScheduleLabel,
  getAutomationSectionTemplates,
  type AutomationDraft,
  type AutomationRecord,
  type AutomationSchedule,
  type AutomationTemplate,
  type AutomationTemplateIcon,
} from "../model/automations";
import type { WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import { useI18n } from "../../../i18n";
import type { ReasoningEffort } from "../../../protocol/generated/ReasoningEffort";

interface AutomationScreenProps {
  readonly automations: AutomationsController;
  readonly workspace: WorkspaceRootController;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
  readonly onOpenLearnMore: () => Promise<void>;
}

interface AutomationDialogState {
  readonly automation: AutomationRecord | null;
  readonly template: AutomationTemplate | null;
}

const WEEKDAY_OPTIONS = [
  { value: 1, labelKey: "home.automation.weekdays.monday" },
  { value: 2, labelKey: "home.automation.weekdays.tuesday" },
  { value: 3, labelKey: "home.automation.weekdays.wednesday" },
  { value: 4, labelKey: "home.automation.weekdays.thursday" },
  { value: 5, labelKey: "home.automation.weekdays.friday" },
] as const;

export function AutomationScreen(props: AutomationScreenProps): JSX.Element {
  const { t } = useI18n();
  const [dialogState, setDialogState] = useState<AutomationDialogState | null>(null);
  const hasWorkspace = props.workspace.roots.length > 0;

  return (
    <section className="automation-screen" aria-label={t("home.automation.title")}>
      <header className="automation-header">
        <div className="automation-header-copy">
          <div className="automation-title-row">
            <h1 className="automation-title">{t("home.automation.title")}</h1>
            <span className="automation-experimental-badge">{t("home.automation.experimentalBadge")}</span>
          </div>
          <p className="automation-subtitle">
            {t("home.automation.subtitle")}
            <button type="button" className="automation-link" onClick={() => void props.onOpenLearnMore()}>
              {t("home.automation.learnMore")}
            </button>
          </p>
          <p className="automation-availability-notice">{t("home.automation.availabilityNotice")}</p>
        </div>
        <button
          type="button"
          className="automation-create-button"
          onClick={() => setDialogState({ automation: null, template: null })}
          disabled={!hasWorkspace}
          title={hasWorkspace ? undefined : t("home.automation.noWorkspaceTooltip")}
        >
          <span aria-hidden="true">+</span>
          {t("home.automation.create")}
        </button>
      </header>

      {props.automations.automations.length > 0 ? (
        <section className="automation-existing-section" aria-labelledby="automation-existing-title">
          <h2 id="automation-existing-title" className="automation-section-title">
            {t("home.automation.existingTitle")}
          </h2>
          <div className="automation-existing-grid">
            {props.automations.automations.map((automation) => (
              <article key={automation.id} className="automation-existing-card">
                <div className="automation-existing-card-main">
                  <div className="automation-existing-name">{automation.name}</div>
                  <div className="automation-existing-meta">
                    {automation.workspaceName} · {t(formatAutomationScheduleLabel(automation.schedule), { time: automation.schedule.time })}
                  </div>
                  <div className="automation-existing-meta">
                    {t("home.automation.nextRun", { time: formatDateTime(automation.nextRunAt) })}
                  </div>
                  {automation.lastError !== null ? (
                    <div className="automation-existing-error">{automation.lastError}</div>
                  ) : null}
                </div>
                <div className="automation-existing-actions">
                  <label className="automation-toggle">
                    <input
                      type="checkbox"
                      checked={automation.enabled}
                      onChange={(event) => props.automations.setAutomationEnabled(automation.id, event.target.checked)}
                    />
                    <span>{automation.enabled ? t("home.automation.enabled") : t("home.automation.disabled")}</span>
                  </label>
                  <button
                    type="button"
                    className="automation-secondary-button"
                    onClick={() => setDialogState({ automation, template: null })}
                  >
                    {t("home.automation.edit")}
                  </button>
                  <button
                    type="button"
                    className="automation-delete-button"
                    onClick={() => props.automations.deleteAutomation(automation.id)}
                  >
                    {t("home.automation.delete")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="automation-template-sections">
        {AUTOMATION_SECTIONS.map((section) => (
          <section key={section.id} className="automation-template-section" aria-labelledby={`automation-section-${section.id}`}>
            <h2 id={`automation-section-${section.id}`} className="automation-section-title">
              {t(section.titleKey)}
            </h2>
            <div className="automation-template-grid">
              {getAutomationSectionTemplates(section).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="automation-template-card"
                  onClick={() => setDialogState({ automation: null, template })}
                  disabled={!hasWorkspace}
                >
                  <AutomationTemplateIconView icon={template.icon} />
                  <span className="automation-template-text">{t(template.promptKey)}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {dialogState !== null ? (
        <AutomationDialog
          automation={dialogState.automation}
          template={dialogState.template}
          automations={props.automations}
          workspace={props.workspace}
          models={props.models}
          defaultModel={props.defaultModel}
          defaultEffort={props.defaultEffort}
          defaultServiceTier={props.defaultServiceTier ?? null}
          onClose={() => setDialogState(null)}
        />
      ) : null}
    </section>
  );
}

function AutomationDialog(props: {
  readonly automations: AutomationsController;
  readonly automation: AutomationRecord | null;
  readonly template: AutomationTemplate | null;
  readonly workspace: WorkspaceRootController;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultServiceTier: ComposerSelection["serviceTier"];
  readonly onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const initialRootId = props.automation?.workspaceRootId ?? props.workspace.selectedRootId ?? props.workspace.roots[0]?.id ?? "";
  const initialModel = props.automation?.model ?? props.defaultModel ?? props.models[0]?.value ?? null;
  const [name, setName] = useState(() => props.automation?.name ?? (props.template === null ? "" : t(props.template.nameKey)));
  const [prompt, setPrompt] = useState(() => props.automation?.prompt ?? (props.template === null ? "" : t(props.template.promptKey)));
  const [schedule, setSchedule] = useState<AutomationSchedule>(() => props.automation?.schedule ?? props.template?.schedule ?? DEFAULT_AUTOMATION_SCHEDULE);
  const [workspaceRootId, setWorkspaceRootId] = useState(initialRootId);
  const [model, setModel] = useState<string | null>(initialModel);
  const [effort, setEffort] = useState<ReasoningEffort | null>(() => resolveAutomationEffort(
    props.models,
    initialModel,
    props.automation?.effort ?? props.defaultEffort,
  ));
  const selectedRoot = useMemo(
    () => props.workspace.roots.find((root) => root.id === workspaceRootId) ?? null,
    [props.workspace.roots, workspaceRootId],
  );
  const selectedModelOption = useMemo(
    () => findComposerModel(props.models, model),
    [model, props.models],
  );
  const canSave = selectedRoot !== null && name.trim().length > 0 && prompt.trim().length > 0 && model !== null;

  const applyTemplate = () => {
    if (props.template === null) {
      return;
    }
    setName(t(props.template.nameKey));
    setPrompt(t(props.template.promptKey));
    setSchedule(props.template.schedule);
  };

  const selectModel = (nextModel: string) => {
    const nextModelOption = findComposerModel(props.models, nextModel);
    setModel(nextModel);
    setEffort(resolveComposerEffort(nextModelOption, effort));
  };

  const saveAutomation = () => {
    if (selectedRoot === null || !canSave) {
      return;
    }
    const draft: AutomationDraft = {
      name,
      prompt,
      schedule,
      workspaceRootId: selectedRoot.id,
      model,
      effort,
      serviceTier: props.automation?.serviceTier ?? props.defaultServiceTier,
    };
    if (props.automation === null) {
      props.automations.createAutomation(draft, selectedRoot);
    } else {
      props.automations.updateAutomation(props.automation.id, draft, selectedRoot);
    }
    props.onClose();
  };

  return (
    <div className="automation-dialog-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="automation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="automation-dialog-header">
          <input
            id="automation-dialog-title"
            className="automation-dialog-title-input"
            aria-label={t("home.automation.dialog.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("home.automation.dialog.namePlaceholder")}
          />
          <div className="automation-dialog-header-actions">
            <button type="button" className="automation-dialog-ghost-button" onClick={() => setPrompt("")}>
              {t("home.automation.dialog.clear")}
            </button>
            <button type="button" className="automation-dialog-info-button" aria-label={t("home.automation.dialog.info")}>
              i
            </button>
            {props.template !== null ? (
              <button type="button" className="automation-secondary-button" onClick={applyTemplate}>
                {t("home.automation.dialog.useTemplate")}
              </button>
            ) : null}
            <button type="button" className="automation-dialog-close" onClick={props.onClose} aria-label={t("home.automation.dialog.close")}>
              ×
            </button>
          </div>
        </header>
        <div className="automation-dialog-body automation-dialog-composer-body">
          <textarea
            className="automation-dialog-prompt"
            aria-label={t("home.automation.dialog.prompt")}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t("home.automation.dialog.promptPlaceholder")}
          />
        </div>
        <footer className="automation-dialog-footer">
          <div className="automation-dialog-toolstrip">
            <span className="automation-toolbar-button" aria-label={t("home.automation.dialog.worktree")}>
              <span aria-hidden="true">↗</span>
              {t("home.automation.dialog.worktree")}
            </span>
            <label className="automation-toolbar-select">
              <span aria-hidden="true">□</span>
              <select
                aria-label={t("home.automation.dialog.workspace")}
                value={workspaceRootId}
                onChange={(event) => setWorkspaceRootId(event.target.value)}
              >
                {props.workspace.roots.map((root) => (
                  <option key={root.id} value={root.id}>{root.name}</option>
                ))}
              </select>
            </label>
            <label className="automation-toolbar-select">
              <span aria-hidden="true">◷</span>
              <select
                aria-label={t("home.automation.dialog.schedule")}
                value={schedule.mode}
                onChange={(event) => setSchedule({
                  ...schedule,
                  mode: event.target.value as AutomationSchedule["mode"],
                  weekday: event.target.value === "weekly" ? schedule.weekday ?? 1 : undefined,
                })}
              >
                <option value="daily">{t("home.automation.scheduleMode.daily")}</option>
                <option value="weekdays">{t("home.automation.scheduleMode.weekdays")}</option>
                <option value="weekly">{t("home.automation.scheduleMode.weekly")}</option>
              </select>
            </label>
            {schedule.mode === "weekly" ? (
              <label className="automation-toolbar-select automation-toolbar-weekday">
                <select
                  aria-label={t("home.automation.dialog.weekday")}
                  value={schedule.weekday ?? 1}
                  onChange={(event) => setSchedule({ ...schedule, weekday: Number(event.target.value) })}
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="automation-toolbar-time">
              <input
                aria-label={t("home.automation.dialog.time")}
                type="time"
                value={schedule.time}
                onChange={(event) => setSchedule({ ...schedule, time: event.target.value })}
              />
            </label>
            <ComposerModelControls
              collaborationPreset="default"
              models={props.models}
              selectedModel={model}
              selectedEffort={effort}
              supportedEfforts={selectedModelOption?.supportedEfforts ?? []}
              onSelectModel={selectModel}
              onSelectEffort={setEffort}
            />
          </div>
          <div className="automation-dialog-actions">
            <button type="button" className="automation-secondary-button" onClick={props.onClose}>
              {t("home.automation.dialog.cancel")}
            </button>
            <button type="button" className="automation-primary-button" disabled={!canSave} onClick={saveAutomation}>
              {props.automation === null ? t("home.automation.dialog.createAction") : t("home.automation.dialog.save")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function resolveAutomationEffort(
  models: ReadonlyArray<ComposerModelOption>,
  model: string | null,
  preferredEffort: ReasoningEffort | null,
): ReasoningEffort | null {
  return resolveComposerEffort(findComposerModel(models, model), preferredEffort);
}

function AutomationTemplateIconView(props: { readonly icon: AutomationTemplateIcon }): JSX.Element {
  const path = getTemplateIconPath(props.icon);
  return (
    <span className={`automation-template-icon automation-template-icon-${props.icon}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" focusable="false">
        <path d={path} fill="currentColor" />
      </svg>
    </span>
  );
}

function getTemplateIconPath(icon: AutomationTemplateIcon): string {
  switch (icon) {
    case "chat":
      return "M4 4.5A2.5 2.5 0 0 1 6.5 2h7A2.5 2.5 0 0 1 16 4.5v4A2.5 2.5 0 0 1 13.5 11H9.1l-3.6 2.4A.6.6 0 0 1 4.6 13v-2A2.5 2.5 0 0 1 4 9.5v-5Z";
    case "document":
      return "M5 2.5h6.5L15 6v11.5H5V2.5Zm6 1.4V6.5h2.6L11 3.9ZM7 9h6v1.4H7V9Zm0 3h6v1.4H7V12Z";
    case "grid":
      return "M3 3h5v5H3V3Zm9 0h5v5h-5V3ZM3 12h5v5H3v-5Zm9 0h5v5h-5v-5Z";
    case "book":
      return "M4 3.5A2.5 2.5 0 0 1 6.5 1H16v14.5H6.5A2.5 2.5 0 0 0 4 18V3.5Zm2.5.3A.9.9 0 0 0 5.6 4.7v9.8c.3-.1.6-.2.9-.2h7.9V3.8H6.5Z";
    case "check":
      return "M8.1 14.5 3.8 10.2l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4-8.1 8.1Z";
    case "pencil":
      return "m4 13.8 8.7-8.7 2.2 2.2-8.7 8.7H4v-2.2Zm10-10 1-1a1.4 1.4 0 0 1 2 2l-1 1L14 3.8Z";
    case "power":
      return "M9 2h2v8H9V2Zm-2.9 3.4 1.4 1.4a4.5 4.5 0 1 0 5 0l1.4-1.4A6.5 6.5 0 1 1 6.1 5.4Z";
    case "terminal":
      return "M3 4h14v12H3V4Zm2.4 3.1L7.8 9l-2.4 1.9.9 1.1L10 9 6.3 6l-.9 1.1ZM10 11v1.4h4.5V11H10Z";
    case "test":
      return "M7 2h6v1.5h-1V8l4 7.5A1.7 1.7 0 0 1 14.5 18h-9A1.7 1.7 0 0 1 4 15.5L8 8V3.5H7V2Zm2.5 6.4L7.7 12h4.6l-1.8-3.6V3.5h-1v4.9Z";
    case "dependency":
      return "M5 4.5A2.5 2.5 0 1 1 7.5 7H7v2h6V7h-.5A2.5 2.5 0 1 1 15 4.5 2.5 2.5 0 0 1 14.5 7H14v3.5H7V13h.5A2.5 2.5 0 1 1 5 15.5 2.5 2.5 0 0 1 5.5 13H6V7h-.5A2.5 2.5 0 0 1 5 4.5Z";
    case "hierarchy":
      return "M9 3h2v4h4v2h-2v2h3v5h-5v-5h1V9H8v2h1v5H4v-5h3V9H5V7h4V3Zm-3.5 9.5v2h2v-2h-2Zm7 0v2h2v-2h-2Z";
    case "chart":
      return "M4 16V4h1.5v10.5H16V16H4Zm3-3V9h2v4H7Zm4 0V6h2v7h-2Z";
    case "search":
    default:
      return "M8.5 3a5.5 5.5 0 0 1 4.4 8.8l3.1 3.1-1.1 1.1-3.1-3.1A5.5 5.5 0 1 1 8.5 3Zm0 1.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Z";
  }
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
