import { useEffect, useMemo, useState } from "react";
import type { CustomPetOutput, CustomPetsOutput } from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import {
  createPetOptions,
  resolveSelectedPetOption,
} from "../model/petCatalog";
import { CodexPetOverlay } from "./CodexPetOverlay";

export function CodexPetLayer(props: {
  readonly awake: boolean;
  readonly selectedPetId: string;
  readonly listCustomPets: () => Promise<CustomPetsOutput>;
  onClose: () => void;
}): JSX.Element | null {
  if (!props.awake) {
    return null;
  }

  return (
    <AwakeCodexPetLayer
      selectedPetId={props.selectedPetId}
      listCustomPets={props.listCustomPets}
      onClose={props.onClose}
    />
  );
}

function AwakeCodexPetLayer(props: {
  readonly selectedPetId: string;
  readonly listCustomPets: () => Promise<CustomPetsOutput>;
  onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const { listCustomPets, onClose, selectedPetId } = props;
  const [customPets, setCustomPets] = useState<ReadonlyArray<CustomPetOutput>>([]);

  useEffect(() => {
    let active = true;
    void listCustomPets()
      .then((output) => {
        if (active) {
          setCustomPets(output.avatars);
        }
      })
      .catch((error) => {
        if (active) {
          console.error("读取自定义宠物失败", error);
          setCustomPets([]);
        }
      });
    return () => {
      active = false;
    };
  }, [listCustomPets]);

  const selectedPet = useMemo(
    () => resolveSelectedPetOption(createPetOptions(customPets), selectedPetId),
    [customPets, selectedPetId],
  );

  return (
    <CodexPetOverlay
      pet={selectedPet}
      closeLabel={t("settings.personalization.pets.tuckAwayPet")}
      onClose={onClose}
    />
  );
}
