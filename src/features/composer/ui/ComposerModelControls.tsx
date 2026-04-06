import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n/useI18n";
import {
  DEFAULT_COMPOSER_MODEL_LABEL,
  getComposerModelLabel,
  partitionComposerModels,
  type ComposerModelOption
} from "../model/composerPreferences";
import type { ReasoningEffort } from "../../../protocol/generated/ReasoningEffort";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import {
  isReasoningEffortSelected,
  listSelectableReasoningEfforts
} from "../model/reasoningEffortOptions";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

type ComposerMenu = "model" | "effort" | null;
const EXTRA_MODELS_CLOSE_DELAY_MS = 160;

function BrainIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.333 2.333a2.167 2.167 0 0 0-3.404 2.62A2.5 2.5 0 0 0 3.5 9.833h2.167m.666-7.5a2.167 2.167 0 0 1 3.404 2.62A2.5 2.5 0 0 1 12.5 9.833h-2.167m-4.666 0V6.167m4 3.666V6.167m-2 7.5a2.166 2.166 0 0 1-2.166-2.167V9.833h4.332V11.5a2.166 2.166 0 0 1-2.166 2.167Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.333 4.5A1.167 1.167 0 0 1 3.5 3.333h2.167l1.167 1.334h5.666A1.167 1.167 0 0 1 13.667 5.833v5.667a1.167 1.167 0 0 1-1.167 1.167H3.5A1.167 1.167 0 0 1 2.333 11.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuCheck(): JSX.Element {
  return (
    <span className="composer-select-check" aria-hidden="true">
      {"\u2713"}
    </span>
  );
}

function reasoningEffortLabel(t: ReturnType<typeof useI18n>["t"], effort: ReasoningEffort | null): string {
  switch (effort) {
    case "none":
      return t("home.composer.reasoningEffort.none");
    case "minimal":
      return t("home.composer.reasoningEffort.minimal");
    case "low":
      return t("home.composer.reasoningEffort.low");
    case "medium":
      return t("home.composer.reasoningEffort.medium");
    case "high":
      return t("home.composer.reasoningEffort.high");
    case "xhigh":
    case null:
      return t("home.composer.reasoningEffort.xhigh");
    default:
      return t("home.composer.reasoningEffort.xhigh");
  }
}

function ModelMenuItem(props: {
  readonly model: ComposerModelOption;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelectModel: (model: string) => void;
}): JSX.Element {
  const itemClassName = props.selected
    ? "composer-select-menu-item composer-select-menu-item-selected"
    : "composer-select-menu-item";

  return (
    <button
      type="button"
      className={itemClassName}
      role="menuitemradio"
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={() => props.onSelectModel(props.model.value)}
    >
      <span className="composer-select-menu-item-label">{props.model.label}</span>
      {props.selected ? <MenuCheck /> : null}
    </button>
  );
}

function useDelayedSubmenuState(): {
  readonly open: boolean;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  readonly toggleMenu: () => void;
} {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => clearCloseTimer, []);

  return {
    open,
    openMenu: () => {
      clearCloseTimer();
      setOpen(true);
    },
    closeMenu: () => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        closeTimerRef.current = null;
      }, EXTRA_MODELS_CLOSE_DELAY_MS);
    },
    toggleMenu: () => {
      clearCloseTimer();
      setOpen((value) => !value);
    }
  };
}

function ExtraModelsFolder(props: {
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly disabled: boolean;
  readonly onSelectModel: (model: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const submenu = useDelayedSubmenuState();
  const open = submenu.open;
  const triggerClassName = open
    ? "composer-select-folder-trigger composer-select-folder-trigger-active"
    : "composer-select-folder-trigger";
  const submenuClassName = open
    ? "composer-select-submenu composer-select-submenu-open"
    : "composer-select-submenu";

  return (
    <div className="composer-select-folder" onMouseEnter={submenu.openMenu} onMouseLeave={submenu.closeMenu}>
      <button
        type="button"
        className={triggerClassName}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={props.disabled}
        onClick={submenu.toggleMenu}
      >
        <span className="composer-select-menu-item-left">
          <FolderIcon className="composer-select-folder-icon" />
          <span className="composer-select-menu-item-label">{t("home.composer.extraModels")}</span>
        </span>
        <span className="composer-select-folder-meta">
          <span className="composer-select-folder-count">{props.models.length}</span>
          <OfficialChevronRightIcon className="composer-select-folder-caret" />
        </span>
      </button>
      <div className={submenuClassName} role="menu" aria-label={t("home.composer.extraModels")} aria-hidden={!open}>
        <div className="composer-select-menu-title">{t("home.composer.extraModels")}</div>
        {props.models.map((model) => (
          <ModelMenuItem
            key={model.id}
            model={model}
            selected={model.value === props.selectedModel}
            disabled={props.disabled}
            onSelectModel={props.onSelectModel}
          />
        ))}
      </div>
    </div>
  );
}

function ModelMenu(props: {
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly disabled: boolean;
  readonly onSelectModel: (model: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const { primaryModels, extraModels } = useMemo(() => partitionComposerModels(props.models), [props.models]);

  return (
    <div className="composer-select-menu composer-select-menu-model" role="menu" aria-label={t("home.toolbar.selectModel")}>
      <div className="composer-select-menu-title">{t("home.toolbar.selectModel")}</div>
      {primaryModels.map((model) => (
        <ModelMenuItem
          key={model.id}
          model={model}
          selected={model.value === props.selectedModel}
          disabled={props.disabled}
          onSelectModel={props.onSelectModel}
        />
      ))}
      {extraModels.length > 0 ? <div className="composer-select-menu-separator" aria-hidden="true" /> : null}
      {extraModels.length > 0 ? (
        <ExtraModelsFolder
          models={extraModels}
          selectedModel={props.selectedModel}
          disabled={props.disabled}
          onSelectModel={props.onSelectModel}
        />
      ) : null}
    </div>
  );
}

function EffortMenu(props: {
  readonly selectedEffort: ReasoningEffort | null;
  readonly supportedEfforts: ReadonlyArray<ReasoningEffort>;
  readonly disabled: boolean;
  readonly onSelectEffort: (effort: ReasoningEffort) => void;
}): JSX.Element {
  const { t } = useI18n();
  const visibleEfforts = useMemo(
    () => listSelectableReasoningEfforts(props.supportedEfforts, props.selectedEffort),
    [props.selectedEffort, props.supportedEfforts]
  );

  return (
    <div className="composer-select-menu composer-select-menu-effort" role="menu" aria-label={t("home.composer.selectReasoningEffort")}>
      <div className="composer-select-menu-title">{t("home.composer.selectReasoningEffort")}</div>
      {visibleEfforts.map((effort) => {
        const selected = isReasoningEffortSelected(props.selectedEffort, effort.value);
        const itemClassName = selected ? "composer-select-menu-item composer-select-menu-item-selected" : "composer-select-menu-item";
        return (
          <button
            key={effort.value}
            type="button"
            className={itemClassName}
            role="menuitemradio"
            aria-checked={selected}
            disabled={props.disabled}
            onClick={() => props.onSelectEffort(effort.value)}
          >
            <span className="composer-select-menu-item-left">
              <BrainIcon className="composer-select-brain" />
              <span className="composer-select-menu-item-label">{reasoningEffortLabel(t, effort.value)}</span>
            </span>
            {selected ? <MenuCheck /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ComposerModelControls(props: {
  readonly disabled?: boolean;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly selectedEffort: ReasoningEffort | null;
  readonly supportedEfforts: ReadonlyArray<ReasoningEffort>;
  readonly onSelectModel: (model: string) => void;
  readonly onSelectEffort: (effort: ReasoningEffort) => void;
}): JSX.Element {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<ComposerMenu>(null);
  const modelLabel = getComposerModelLabel(props.models, props.selectedModel);
  const effortLabel = reasoningEffortLabel(t, props.selectedEffort);
  useToolbarMenuDismissal(openMenu !== null, containerRef, () => setOpenMenu(null));

  const onSelectModel = (model: string) => {
    props.onSelectModel(model);
    setOpenMenu(null);
  };

  const onSelectEffort = (effort: ReasoningEffort) => {
    props.onSelectEffort(effort);
    setOpenMenu(null);
  };

  return (
    <div className="composer-select-group" ref={containerRef}>
      <div className="composer-select-anchor">
        {openMenu === "model" ? (
          <ModelMenu disabled={props.disabled ?? false} models={props.models} selectedModel={props.selectedModel} onSelectModel={onSelectModel} />
        ) : null}
        <button
          type="button"
          className={openMenu === "model" ? "composer-select-trigger composer-select-trigger-active" : "composer-select-trigger"}
          aria-haspopup="menu"
          aria-expanded={openMenu === "model"}
          aria-label={`${t("home.toolbar.selectModel")}: ${modelLabel}`}
          disabled={props.disabled}
          onClick={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
        >
          <span className="composer-select-trigger-text">{modelLabel || DEFAULT_COMPOSER_MODEL_LABEL}</span>
          <OfficialChevronRightIcon className="composer-select-caret" />
        </button>
      </div>
      <div className="composer-select-anchor">
        {openMenu === "effort" ? (
          <EffortMenu disabled={props.disabled ?? false} selectedEffort={props.selectedEffort} supportedEfforts={props.supportedEfforts} onSelectEffort={onSelectEffort} />
        ) : null}
        <button
          type="button"
          className={openMenu === "effort" ? "composer-select-trigger composer-select-trigger-active" : "composer-select-trigger"}
          aria-haspopup="menu"
          aria-expanded={openMenu === "effort"}
          aria-label={`${t("home.composer.selectReasoningEffort")}: ${effortLabel}`}
          disabled={props.disabled}
          onClick={() => setOpenMenu((current) => (current === "effort" ? null : "effort"))}
        >
          <BrainIcon className="composer-select-brain" />
          <span className="composer-select-trigger-text">{effortLabel}</span>
          <OfficialChevronRightIcon className="composer-select-caret" />
        </button>
      </div>
    </div>
  );
}
