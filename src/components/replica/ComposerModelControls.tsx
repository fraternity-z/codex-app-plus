import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_COMPOSER_MODEL_LABEL,
  getComposerModelLabel,
  type ComposerModelOption
} from "../../app/composerPreferences";
import type { ReasoningEffort } from "../../protocol/generated/ReasoningEffort";
import { OfficialChevronRightIcon } from "./officialIcons";
import {
  getReasoningEffortLabel,
  isReasoningEffortSelected,
  listSelectableReasoningEfforts
} from "./reasoningEffortOptions";
import { useToolbarMenuDismissal } from "./useToolbarMenuDismissal";

type ComposerMenu = "model" | "effort" | null;

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

function MenuCheck(): JSX.Element {
  return (
    <span className="composer-select-check" aria-hidden="true">
      ✓
    </span>
  );
}

function ModelMenu(props: {
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly onSelectModel: (model: string) => void;
}): JSX.Element {
  return (
    <div className="composer-select-menu composer-select-menu-model" role="menu" aria-label="选择模型">
      <div className="composer-select-menu-title">选择模型</div>
      {props.models.map((model) => {
        const selected = model.value === props.selectedModel;
        const itemClassName = selected ? "composer-select-menu-item composer-select-menu-item-selected" : "composer-select-menu-item";
        return (
          <button
            key={model.id}
            type="button"
            className={itemClassName}
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => props.onSelectModel(model.value)}
          >
            <span className="composer-select-menu-item-label">{model.label}</span>
            {selected ? <MenuCheck /> : null}
          </button>
        );
      })}
    </div>
  );
}

function EffortMenu(props: {
  readonly selectedEffort: ReasoningEffort | null;
  readonly supportedEfforts: ReadonlyArray<ReasoningEffort>;
  readonly onSelectEffort: (effort: ReasoningEffort) => void;
}): JSX.Element {
  const visibleEfforts = useMemo(
    () => listSelectableReasoningEfforts(props.supportedEfforts, props.selectedEffort),
    [props.selectedEffort, props.supportedEfforts]
  );

  return (
    <div className="composer-select-menu composer-select-menu-effort" role="menu" aria-label="选择推理强度">
      <div className="composer-select-menu-title">选择推理强度</div>
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
            onClick={() => props.onSelectEffort(effort.value)}
          >
            <span className="composer-select-menu-item-left">
              <BrainIcon className="composer-select-brain" />
              <span className="composer-select-menu-item-label">{effort.label}</span>
            </span>
            {selected ? <MenuCheck /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ComposerModelControls(props: {
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly selectedModel: string | null;
  readonly selectedEffort: ReasoningEffort | null;
  readonly supportedEfforts: ReadonlyArray<ReasoningEffort>;
  readonly onSelectModel: (model: string) => void;
  readonly onSelectEffort: (effort: ReasoningEffort) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<ComposerMenu>(null);
  const modelLabel = getComposerModelLabel(props.models, props.selectedModel);
  const effortLabel = getReasoningEffortLabel(props.selectedEffort);
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
        {openMenu === "model" ? <ModelMenu models={props.models} selectedModel={props.selectedModel} onSelectModel={onSelectModel} /> : null}
        <button
          type="button"
          className={openMenu === "model" ? "composer-select-trigger composer-select-trigger-active" : "composer-select-trigger"}
          aria-haspopup="menu"
          aria-expanded={openMenu === "model"}
          aria-label={`选择模型：${modelLabel}`}
          onClick={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
        >
          <span className="composer-select-trigger-text">{modelLabel || DEFAULT_COMPOSER_MODEL_LABEL}</span>
          <OfficialChevronRightIcon className="composer-select-caret" />
        </button>
      </div>
      <div className="composer-select-anchor">
        {openMenu === "effort" ? (
          <EffortMenu selectedEffort={props.selectedEffort} supportedEfforts={props.supportedEfforts} onSelectEffort={onSelectEffort} />
        ) : null}
        <button
          type="button"
          className={openMenu === "effort" ? "composer-select-trigger composer-select-trigger-active" : "composer-select-trigger"}
          aria-haspopup="menu"
          aria-expanded={openMenu === "effort"}
          aria-label={`选择思考强度：${effortLabel}`}
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
