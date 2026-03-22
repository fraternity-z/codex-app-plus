import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { useI18n } from "../../../i18n";
import {
  CODE_FONT_SIZE_DEFAULT,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from "../model/fontPreferences";

interface DisplaySettingsCardProps {
  readonly preferences: AppPreferencesController;
}

interface FontFamilyRowProps {
  readonly label: string;
  readonly description: string;
  readonly note: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}

interface FontSizeRowProps {
  readonly label: string;
  readonly description: string;
  readonly note: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly value: number;
  readonly onCommit: (value: number) => void;
}

function commitTextValue(
  draft: string,
  onCommit: (value: string) => void,
): void {
  onCommit(draft);
}

function commitNumberValue(
  draft: string,
  currentValue: number,
  onCommit: (value: number) => void,
  resetDraft: (value: string) => void,
): void {
  const parsed = Number.parseInt(draft, 10);
  if (!Number.isFinite(parsed)) {
    resetDraft(String(currentValue));
    return;
  }
  onCommit(parsed);
}

function handleCommitKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  commit: () => void,
): void {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  commit();
}

function FontFamilyRow(props: FontFamilyRowProps): JSX.Element {
  const [draft, setDraft] = useState(props.value);
  const commit = useCallback(() => {
    commitTextValue(draft, props.onCommit);
  }, [draft, props]);

  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{props.label}</strong>
        <p>{props.description}</p>
        <p className="settings-row-note">{props.note}</p>
      </div>
      <div className="settings-row-control">
        <input
          className="settings-text-input settings-font-input"
          aria-label={props.label}
          placeholder={props.placeholder}
          value={draft}
          onBlur={commit}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => handleCommitKeyDown(event, commit)}
        />
      </div>
    </div>
  );
}

function FontSizeRow(props: FontSizeRowProps): JSX.Element {
  const [draft, setDraft] = useState(String(props.value));
  const commit = useCallback(() => {
    commitNumberValue(draft, props.value, props.onCommit, setDraft);
  }, [draft, props]);

  useEffect(() => {
    setDraft(String(props.value));
  }, [props.value]);

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{props.label}</strong>
        <p>{props.description}</p>
        <p className="settings-row-note">{props.note}</p>
      </div>
      <div className="settings-row-control">
        <input
          className="settings-text-input settings-number-input"
          aria-label={props.label}
          inputMode="numeric"
          max={props.maximum}
          min={props.minimum}
          step={1}
          type="number"
          value={draft}
          onBlur={commit}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => handleCommitKeyDown(event, commit)}
        />
      </div>
    </div>
  );
}

export function DisplaySettingsCard(
  props: DisplaySettingsCardProps,
): JSX.Element {
  const { t } = useI18n();

  return (
    <section className="settings-card">
      <div className="settings-section-head">
        <strong>{t("settings.general.display.title")}</strong>
      </div>
      <p className="settings-note">{t("settings.general.display.note")}</p>
      <FontFamilyRow
        label={t("settings.general.display.uiFontFamily.label")}
        description={t("settings.general.display.uiFontFamily.description")}
        note={t("settings.general.display.uiFontFamily.note")}
        placeholder={t("settings.general.display.uiFontFamily.placeholder")}
        value={props.preferences.uiFontFamily}
        onCommit={props.preferences.setUiFontFamily}
      />
      <FontSizeRow
        label={t("settings.general.display.uiFontSize.label")}
        description={t("settings.general.display.uiFontSize.description")}
        note={t("settings.general.display.uiFontSize.note", {
          default: UI_FONT_SIZE_DEFAULT,
          max: UI_FONT_SIZE_MAX,
          min: UI_FONT_SIZE_MIN,
        })}
        minimum={UI_FONT_SIZE_MIN}
        maximum={UI_FONT_SIZE_MAX}
        value={props.preferences.uiFontSize}
        onCommit={props.preferences.setUiFontSize}
      />
      <FontFamilyRow
        label={t("settings.general.display.codeFontFamily.label")}
        description={t("settings.general.display.codeFontFamily.description")}
        note={t("settings.general.display.codeFontFamily.note")}
        placeholder={t("settings.general.display.codeFontFamily.placeholder")}
        value={props.preferences.codeFontFamily}
        onCommit={props.preferences.setCodeFontFamily}
      />
      <FontSizeRow
        label={t("settings.general.display.codeFontSize.label")}
        description={t("settings.general.display.codeFontSize.description")}
        note={t("settings.general.display.codeFontSize.note", {
          default: CODE_FONT_SIZE_DEFAULT,
          max: CODE_FONT_SIZE_MAX,
          min: CODE_FONT_SIZE_MIN,
        })}
        minimum={CODE_FONT_SIZE_MIN}
        maximum={CODE_FONT_SIZE_MAX}
        value={props.preferences.codeFontSize}
        onCommit={props.preferences.setCodeFontSize}
      />
    </section>
  );
}
