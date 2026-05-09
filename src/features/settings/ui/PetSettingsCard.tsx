import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomPetOutput, CustomPetsOutput } from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import {
  createPetOptions,
  resolveSelectedPetOption,
  type PetOption,
} from "../../pets/model/petCatalog";
import { CodexPetAvatar } from "../../pets/ui/CodexPetAvatar";

interface CustomPetState {
  readonly avatarDirectory: string;
  readonly avatars: ReadonlyArray<CustomPetOutput>;
  readonly loading: boolean;
  readonly error: string | null;
}

const INITIAL_CUSTOM_PET_STATE: CustomPetState = {
  avatarDirectory: "~/.codex/pets",
  avatars: [],
  loading: false,
  error: null,
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PetRow(props: {
  readonly pet: PetOption;
  readonly selected: boolean;
  readonly selectedLabel: string;
  readonly selectLabel: string;
  readonly selectAriaLabel: string;
  readonly selectedAriaLabel: string;
  onSelect: () => void;
}): JSX.Element {
  const actionLabel = props.selected ? props.selectedLabel : props.selectLabel;
  return (
    <div className="settings-pet-row">
      <div className="settings-pet-preview">
        <CodexPetAvatar
          className="settings-pet-preview-avatar"
          pet={props.pet}
          sizeRem={3.75}
          state="idle"
        />
      </div>
      <div className="settings-pet-copy">
        <strong>{props.pet.displayName}</strong>
        {props.pet.description.length > 0 && <p>{props.pet.description}</p>}
      </div>
      <button
        type="button"
        className={[
          "settings-pet-select-button",
          props.selected ? "settings-pet-select-button-selected" : "",
        ].filter(Boolean).join(" ")}
        aria-label={props.selected ? props.selectedAriaLabel : props.selectAriaLabel}
        disabled={props.selected}
        onClick={props.onSelect}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function PetSettingsCard(props: {
  readonly preferences: Pick<AppPreferencesController, "selectedPetId" | "setSelectedPetId">;
  readonly busy: boolean;
  readonly petAwake: boolean;
  readonly listCustomPets: () => Promise<CustomPetsOutput>;
  readonly openCustomPetsFolder: (path: string) => Promise<void>;
  onTogglePetAwake: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [customPets, setCustomPets] = useState<CustomPetState>(INITIAL_CUSTOM_PET_STATE);

  const refreshCustomPets = useCallback(async () => {
    setCustomPets((current) => ({ ...current, loading: true, error: null }));
    try {
      const output = await props.listCustomPets();
      setCustomPets({
        avatarDirectory: output.avatarDirectory,
        avatars: output.avatars,
        loading: false,
        error: null,
      });
    } catch (error) {
      setCustomPets((current) => ({
        ...current,
        loading: false,
        error: t("settings.personalization.pets.loadCustomError", {
          error: toErrorMessage(error),
        }),
      }));
    }
  }, [props.listCustomPets, t]);

  useEffect(() => {
    let active = true;
    setCustomPets((current) => ({ ...current, loading: true, error: null }));
    void props.listCustomPets()
      .then((output) => {
        if (!active) {
          return;
        }
        setCustomPets({
          avatarDirectory: output.avatarDirectory,
          avatars: output.avatars,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setCustomPets((current) => ({
          ...current,
          loading: false,
          error: t("settings.personalization.pets.loadCustomError", {
            error: toErrorMessage(error),
          }),
        }));
      });
    return () => {
      active = false;
    };
  }, [props.listCustomPets, t]);

  const petOptions = useMemo(
    () => createPetOptions(customPets.avatars),
    [customPets.avatars],
  );
  const selectedPet = resolveSelectedPetOption(petOptions, props.preferences.selectedPetId);

  const handleOpenCustomPetsFolder = async () => {
    try {
      await props.openCustomPetsFolder(customPets.avatarDirectory);
    } catch (error) {
      setCustomPets((current) => ({
        ...current,
        error: t("settings.personalization.pets.openFolderError", {
          error: toErrorMessage(error),
        }),
      }));
    }
  };

  return (
    <>
      <section className="settings-pets-card">
        <button
          type="button"
          className="settings-pets-header"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="settings-pets-header-copy">
            <strong>{t("settings.personalization.pets.title")}</strong>
            <span>
              {t("settings.personalization.pets.current", {
                petName: selectedPet.displayName,
              })}
            </span>
          </span>
          <span className={expanded ? "settings-pet-chevron settings-pet-chevron-open" : "settings-pet-chevron"} />
        </button>
        {expanded && (
          <div className="settings-pets-expanded">
            <div className="settings-pets-toolbar">
              <button
                type="button"
                className="settings-pet-pill-button"
                disabled={props.busy || customPets.loading}
                onClick={() => void refreshCustomPets()}
              >
                {t("settings.personalization.pets.refresh")}
              </button>
              <button
                type="button"
                className="settings-pet-pill-button"
                disabled={props.busy}
                onClick={props.onTogglePetAwake}
              >
                {props.petAwake
                  ? t("settings.personalization.pets.tuckAwayPet")
                  : t("settings.personalization.pets.openPet")}
              </button>
            </div>
            <div className="settings-pet-list">
              {petOptions.map((pet) => (
                <PetRow
                  key={pet.id}
                  pet={pet}
                  selected={pet.id === selectedPet.id}
                  selectedLabel={t("settings.personalization.pets.selectedAction")}
                  selectLabel={t("settings.personalization.pets.selectAction")}
                  selectedAriaLabel={t("settings.personalization.pets.selectedPetAction", {
                    petName: pet.displayName,
                  })}
                  selectAriaLabel={t("settings.personalization.pets.selectPetAction", {
                    petName: pet.displayName,
                  })}
                  onSelect={() => props.preferences.setSelectedPetId(pet.id)}
                />
              ))}
            </div>
            <div className="settings-pets-custom-footer">
              <div className="settings-pets-custom-copy">
                <strong>{t("settings.personalization.pets.customTitle")}</strong>
                <code>{customPets.avatarDirectory}</code>
              </div>
              <button
                type="button"
                className="settings-pets-open-folder"
                onClick={() => void handleOpenCustomPetsFolder()}
              >
                {t("settings.personalization.pets.openFolder")}
                <span className="settings-pets-open-folder-icon" aria-hidden="true" />
              </button>
            </div>
            {customPets.loading && (
              <p className="settings-pets-status">
                {t("settings.personalization.pets.loadingCustom")}
              </p>
            )}
            {customPets.error !== null && (
              <p className="settings-pets-status settings-pets-status-error">
                {customPets.error}
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
