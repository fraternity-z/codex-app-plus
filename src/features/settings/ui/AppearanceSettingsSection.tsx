import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { CustomPetsOutput } from "../../../bridge/types";
import type { ResolvedTheme } from "../../../domain/theme";
import { useI18n } from "../../../i18n";
import LightIcon from "../../../assets/icons/light.svg";
import DarkIcon from "../../../assets/icons/dark.svg";
import SystemIcon from "../../../assets/icons/system.svg";
import { getAppearanceThemeColors } from "../model/appearanceColorScheme";
import {
  APP_CONTRAST_MAX,
  APP_CONTRAST_MIN,
} from "../model/appearancePreferences";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from "../model/fontPreferences";
import { AppearanceColorControl } from "./AppearanceColorControl";
import { CodeStylePreview } from "./CodeStylePreview";
import { CodeStyleSelect } from "./CodeStyleSelect";
import { PetSettingsCard } from "./PetSettingsCard";

interface AppearanceSettingsSectionProps {
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly busy: boolean;
  readonly petAwake: boolean;
  readonly listCustomPets: () => Promise<CustomPetsOutput>;
  readonly openCustomPetsFolder: (path: string) => Promise<void>;
  onTogglePetAwake: () => void;
}

interface ThemeChipProps {
  readonly active: boolean;
  readonly iconSrc: string;
  readonly label: string;
  onClick: () => void;
}

interface SimpleRowProps {
  readonly label: string;
  readonly control: JSX.Element;
}

interface FontSizeRowProps {
  readonly label: string;
  readonly description: string;
  readonly max: number;
  readonly min: number;
  readonly value: number;
  onChange: (value: number) => void;
}

function ThemeChip(props: ThemeChipProps): JSX.Element {
  const className = props.active ? "theme-chip active" : "theme-chip";
  return (
    <button type="button" className={className} aria-pressed={props.active} onClick={props.onClick}>
      <span className="icon">
        <img src={props.iconSrc} alt="" />
      </span>
      <span>{props.label}</span>
    </button>
  );
}

function SimpleRow(props: SimpleRowProps): JSX.Element {
  return (
    <div className="settings-row-simple">
      <span>{props.label}</span>
      {props.control}
    </div>
  );
}

function FontSizeRow(props: FontSizeRowProps): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{props.label}</strong>
        <p>{props.description}</p>
      </div>
      <div className="settings-row-control">
        <div className="number-input-wrapper">
          <input
            aria-label={props.label}
            max={props.max}
            min={props.min}
            type="number"
            value={props.value}
            onChange={(event) => props.onChange(Number.parseInt(event.target.value, 10))}
          />
          <span className="unit">px</span>
        </div>
      </div>
    </div>
  );
}

function ThemePreview(props: { readonly preferences: AppPreferencesController }): JSX.Element {
  const { preferences } = props;
  const { t } = useI18n();

  return (
    <div className="code-style-section">
      <CodeStylePreview codeStyle={preferences.codeStyle} />
      <div className="code-style-bar">
        <div className="code-style-info">
          <span>{t("settings.appearance.codeStyle.label")}</span>
        </div>
        <CodeStyleSelect
          label={t("settings.appearance.codeStyle.label")}
          value={preferences.codeStyle}
          onChange={preferences.setCodeStyle}
        />
      </div>
    </div>
  );
}

function resolveEditingTheme(
  themeMode: AppPreferencesController["themeMode"],
  resolvedTheme: ResolvedTheme,
): ResolvedTheme {
  return themeMode === "system" ? resolvedTheme : themeMode;
}

function AppearanceGrid(props: Pick<AppearanceSettingsSectionProps, "preferences" | "resolvedTheme">): JSX.Element {
  const { preferences, resolvedTheme } = props;
  const { t } = useI18n();
  const editingTheme = resolveEditingTheme(preferences.themeMode, resolvedTheme);
  const themeColors = getAppearanceThemeColors(
    preferences.appearanceColors,
    editingTheme,
  );

  return (
    <div className="appearance-grid-settings">
      <p className="appearance-color-note">
        {editingTheme === "light"
          ? t("settings.appearance.colors.editingLight")
          : t("settings.appearance.colors.editingDark")}
      </p>
      <SimpleRow
        label={t("settings.appearance.colors.accent")}
        control={(
          <AppearanceColorControl
            label={t("settings.appearance.colors.accent")}
            pickerLabel={`${t("settings.appearance.colors.accent")} ${t("settings.appearance.colors.picker")}`}
            value={themeColors.accent}
            onChange={(value) =>
              preferences.setAppearanceThemeColors(editingTheme, {
                accent: value,
              })}
          />
        )}
      />
      <SimpleRow
        label={t("settings.appearance.colors.background")}
        control={(
          <AppearanceColorControl
            label={t("settings.appearance.colors.background")}
            pickerLabel={`${t("settings.appearance.colors.background")} ${t("settings.appearance.colors.picker")}`}
            value={themeColors.background}
            onChange={(value) =>
              preferences.setAppearanceThemeColors(editingTheme, {
                background: value,
              })}
          />
        )}
      />
      <SimpleRow
        label={t("settings.appearance.colors.foreground")}
        control={(
          <AppearanceColorControl
            label={t("settings.appearance.colors.foreground")}
            pickerLabel={`${t("settings.appearance.colors.foreground")} ${t("settings.appearance.colors.picker")}`}
            value={themeColors.foreground}
            onChange={(value) =>
              preferences.setAppearanceThemeColors(editingTheme, {
                foreground: value,
              })}
          />
        )}
      />
      <SimpleRow
        label={t("settings.appearance.fonts.uiFont")}
        control={(
          <input
            aria-label={t("settings.appearance.fonts.uiFont")}
            className="font-text-input"
            type="text"
            value={preferences.uiFontFamily}
            onChange={(event) => preferences.setUiFontFamily(event.target.value)}
          />
        )}
      />
      <SimpleRow
        label={t("settings.appearance.fonts.codeFont")}
        control={(
          <input
            aria-label={t("settings.appearance.fonts.codeFont")}
            className="font-text-input appearance-code-family-input"
            type="text"
            value={preferences.codeFontFamily}
            onChange={(event) => preferences.setCodeFontFamily(event.target.value)}
          />
        )}
      />
      <SimpleRow
        label={t("settings.appearance.contrast.label")}
        control={(
          <div className="range-wrapper">
            <input
              aria-label={t("settings.appearance.contrast.label")}
              max={APP_CONTRAST_MAX}
              min={APP_CONTRAST_MIN}
              type="range"
              value={preferences.contrast}
              onChange={(event) => preferences.setContrast(Number.parseInt(event.target.value, 10))}
            />
            <span className="range-value">{preferences.contrast}</span>
          </div>
        )}
      />
    </div>
  );
}

function AppearanceFontSizes(props: { readonly preferences: AppPreferencesController }): JSX.Element {
  const { preferences } = props;
  const { t } = useI18n();

  return (
    <section className="settings-card">
      <FontSizeRow
        description={t("settings.appearance.fonts.uiFontSizeDesc")}
        label={t("settings.appearance.fonts.uiFontSize")}
        max={UI_FONT_SIZE_MAX}
        min={UI_FONT_SIZE_MIN}
        value={preferences.uiFontSize}
        onChange={preferences.setUiFontSize}
      />
      <FontSizeRow
        description={t("settings.appearance.fonts.codeFontSizeDesc")}
        label={t("settings.appearance.fonts.codeFontSize")}
        max={CODE_FONT_SIZE_MAX}
        min={CODE_FONT_SIZE_MIN}
        value={preferences.codeFontSize}
        onChange={preferences.setCodeFontSize}
      />
    </section>
  );
}

export function AppearanceSettingsSection(
  props: AppearanceSettingsSectionProps,
): JSX.Element {
  const { preferences } = props;
  const { t } = useI18n();

  return (
    <div className="settings-panel-group appearance-settings">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.appearance.title")}</h1>
      </header>

      <section className="settings-card appearance-theme-section">
        <div className="theme-header">
          <div className="theme-header-copy">
            <strong>{t("settings.appearance.theme.title")}</strong>
            <p>{t("settings.appearance.theme.description")}</p>
          </div>
          <div className="theme-selector-chips">
            <ThemeChip
              active={preferences.themeMode === "light"}
              iconSrc={LightIcon}
              label={t("settings.appearance.theme.options.light")}
              onClick={() => preferences.setThemeMode("light")}
            />
            <ThemeChip
              active={preferences.themeMode === "dark"}
              iconSrc={DarkIcon}
              label={t("settings.appearance.theme.options.dark")}
              onClick={() => preferences.setThemeMode("dark")}
            />
            <ThemeChip
              active={preferences.themeMode === "system"}
              iconSrc={SystemIcon}
              label={t("settings.appearance.theme.options.system")}
              onClick={() => preferences.setThemeMode("system")}
            />
          </div>
        </div>

        <ThemePreview preferences={preferences} />
        <AppearanceGrid
          preferences={preferences}
          resolvedTheme={props.resolvedTheme}
        />
      </section>

      <AppearanceFontSizes preferences={preferences} />
      <PetSettingsCard
        busy={props.busy}
        petAwake={props.petAwake}
        preferences={preferences}
        listCustomPets={props.listCustomPets}
        openCustomPetsFolder={props.openCustomPetsFolder}
        onTogglePetAwake={props.onTogglePetAwake}
      />
    </div>
  );
}
