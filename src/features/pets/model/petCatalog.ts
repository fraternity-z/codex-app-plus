import bsodSpritesheetUrl from "../../../assets/official/pets/bsod.webp";
import codexSpritesheetUrl from "../../../assets/official/pets/codex.webp";
import deweySpritesheetUrl from "../../../assets/official/pets/dewey.webp";
import fireballSpritesheetUrl from "../../../assets/official/pets/fireball.webp";
import nullSignalSpritesheetUrl from "../../../assets/official/pets/null-signal.webp";
import rockySpritesheetUrl from "../../../assets/official/pets/rocky.webp";
import seedySpritesheetUrl from "../../../assets/official/pets/seedy.webp";
import stackySpritesheetUrl from "../../../assets/official/pets/stacky.webp";
import type { CustomPetOutput } from "../../../bridge/types";

export const DEFAULT_SELECTED_PET_ID = "codex";

export interface PetDefinition {
  readonly id: string;
  readonly assetRef: string;
  readonly displayName: string;
  readonly description: string;
  readonly spritesheetUrl: string;
}

export interface PetOption extends PetDefinition {
  readonly source: "builtIn" | "custom";
}

export const BUILT_IN_PETS: ReadonlyArray<PetDefinition> = [
  {
    id: "codex",
    assetRef: "codex",
    displayName: "Codex",
    description: "The original Codex companion.",
    spritesheetUrl: codexSpritesheetUrl,
  },
  {
    id: "dewey",
    assetRef: "dewey",
    displayName: "Dewey",
    description: "A tidy duck for calm workspace days.",
    spritesheetUrl: deweySpritesheetUrl,
  },
  {
    id: "fireball",
    assetRef: "fireball",
    displayName: "Fireball",
    description: "Hot path energy for fast iteration.",
    spritesheetUrl: fireballSpritesheetUrl,
  },
  {
    id: "rocky",
    assetRef: "rocky",
    displayName: "Rocky",
    description: "A steady rock when the diff gets large.",
    spritesheetUrl: rockySpritesheetUrl,
  },
  {
    id: "seedy",
    assetRef: "seedy",
    displayName: "Seedy",
    description: "Small green shoots for new ideas.",
    spritesheetUrl: seedySpritesheetUrl,
  },
  {
    id: "stacky",
    assetRef: "stacky",
    displayName: "Stacky",
    description: "A balanced stack for deep work.",
    spritesheetUrl: stackySpritesheetUrl,
  },
  {
    id: "bsod",
    assetRef: "bsod",
    displayName: "BSOD",
    description: "A tiny blue-screen gremlin.",
    spritesheetUrl: bsodSpritesheetUrl,
  },
  {
    id: "null-signal",
    assetRef: "null-signal",
    displayName: "Null Signal",
    description: "Quiet signal from the void.",
    spritesheetUrl: nullSignalSpritesheetUrl,
  },
];

export function createPetOptions(
  customPets: ReadonlyArray<CustomPetOutput>,
): ReadonlyArray<PetOption> {
  return [
    ...BUILT_IN_PETS.map((pet) => ({ ...pet, source: "builtIn" as const })),
    ...customPets.map((pet) => ({
      id: pet.id,
      assetRef: "codex",
      displayName: pet.displayName,
      description: pet.description ?? "",
      spritesheetUrl: pet.spritesheetDataUrl,
      source: "custom" as const,
    })),
  ];
}

export function normalizePetId(value: unknown, fallback = DEFAULT_SELECTED_PET_ID): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function resolveSelectedPetOption(
  options: ReadonlyArray<PetOption>,
  selectedPetId: string,
): PetOption {
  return (
    options.find((option) => option.id === selectedPetId)
    ?? options.find((option) => option.id === DEFAULT_SELECTED_PET_ID)
    ?? options[0]
  );
}
