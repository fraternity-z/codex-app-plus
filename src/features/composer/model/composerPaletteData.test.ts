import { describe, expect, it } from "vitest";
import { DEFAULT_COMPOSER_SLASH_CAPABILITIES } from "./composerSlashCommandCatalog";
import { createPaletteItems } from "./composerPaletteData";

describe("composerPaletteData", () => {
  it("builds mention items with absolute file paths", () => {
    const items = createPaletteItems(
      "mention",
      { kind: "mention", query: "app", range: { start: 0, end: 4 } },
      [],
      null,
      "default",
      {
        files: [{
          root: "E:/code/codex-app-plus",
          path: "src/App.tsx",
          file_name: "App.tsx",
          score: 1,
          indices: null,
        }],
        completed: true,
      },
      null,
      {
        slashContext: {
          hasThread: true,
          hasWorkspace: true,
          realtimeActive: false,
          taskRunning: false,
          capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
        },
        customPrompts: [],
        collaborationItems: [],
        resumeItems: [],
      },
    );

    expect(items).toEqual([{
      key: "E:/code/codex-app-plus/src/App.tsx",
      label: "App.tsx",
      description: "src/App.tsx",
      disabled: false,
      meta: null,
    }]);
  });
});
