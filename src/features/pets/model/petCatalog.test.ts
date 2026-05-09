import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PETS,
  createPetOptions,
  DEFAULT_SELECTED_PET_ID,
  normalizePetId,
  resolveSelectedPetOption,
} from "./petCatalog";

describe("petCatalog", () => {
  it("matches the official built-in pet data", () => {
    expect(BUILT_IN_PETS.map((pet) => ({
      id: pet.id,
      assetRef: pet.assetRef,
      displayName: pet.displayName,
      description: pet.description,
    }))).toEqual([
      {
        id: "codex",
        assetRef: "codex",
        displayName: "Codex",
        description: "The original Codex companion.",
      },
      {
        id: "dewey",
        assetRef: "dewey",
        displayName: "Dewey",
        description: "A tidy duck for calm workspace days.",
      },
      {
        id: "fireball",
        assetRef: "fireball",
        displayName: "Fireball",
        description: "Hot path energy for fast iteration.",
      },
      {
        id: "rocky",
        assetRef: "rocky",
        displayName: "Rocky",
        description: "A steady rock when the diff gets large.",
      },
      {
        id: "seedy",
        assetRef: "seedy",
        displayName: "Seedy",
        description: "Small green shoots for new ideas.",
      },
      {
        id: "stacky",
        assetRef: "stacky",
        displayName: "Stacky",
        description: "A balanced stack for deep work.",
      },
      {
        id: "bsod",
        assetRef: "bsod",
        displayName: "BSOD",
        description: "A tiny blue-screen gremlin.",
      },
      {
        id: "null-signal",
        assetRef: "null-signal",
        displayName: "Null Signal",
        description: "Quiet signal from the void.",
      },
    ]);
  });

  it("appends custom pets with official custom ids and spritesheet data URLs", () => {
    const options = createPetOptions([
      {
        id: "custom:001",
        displayName: "001",
        description: "A tiny snow-star companion.",
        spritesheetDataUrl: "data:image/webp;base64,abc",
      },
    ]);

    expect(options.at(-1)).toEqual({
      id: "custom:001",
      assetRef: "codex",
      displayName: "001",
      description: "A tiny snow-star companion.",
      spritesheetUrl: "data:image/webp;base64,abc",
      source: "custom",
    });
  });

  it("falls back to Codex when a stored selection is unavailable", () => {
    const options = createPetOptions([]);

    expect(resolveSelectedPetOption(options, "missing").id).toBe(DEFAULT_SELECTED_PET_ID);
  });

  it("normalizes empty stored pet ids", () => {
    expect(normalizePetId("  dewey  ")).toBe("dewey");
    expect(normalizePetId("")).toBe(DEFAULT_SELECTED_PET_ID);
    expect(normalizePetId(null)).toBe(DEFAULT_SELECTED_PET_ID);
  });
});
