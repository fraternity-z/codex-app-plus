import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { ThemeMode } from "../../../domain/theme";
import { useI18n, type MessageKey } from "../../../i18n";
import { DisplaySettingsCard } from "./DisplaySettingsCard";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

type Translator = (key: MessageKey) => string;

interface AppearanceSettingsSectionProps {
  readonly preferences: AppPreferencesController;
}

function createThemeOptions(
  t: Translator,
): ReadonlyArray<SettingsSelectOption<ThemeMode>> {
  return [
    { value: "system", label: t("settings.general.theme.options.system") },
    { value: "light", label: t("settings.general.theme.options.light") },
    { value: "dark", label: t("settings.general.theme.options.dark") },
  ];
}

export function AppearanceSettingsSection(
  props: AppearanceSettingsSectionProps,
): JSX.Element {
  const { t } = useI18n();
  const themeOptions = createThemeOptions(t);

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.appearance.title")}</h1>
      </header>
      <section className="settings-card">
        <SettingsSelectRow
          label={t("settings.general.theme.label")}
          description={t("settings.general.theme.description")}
          value={props.preferences.themeMode}
          options={themeOptions}
          onChange={props.preferences.setThemeMode}
          statusNote={t("settings.general.theme.note")}
        />
      </section>
      <DisplaySettingsCard preferences={props.preferences} />
    </div>
  );
}
