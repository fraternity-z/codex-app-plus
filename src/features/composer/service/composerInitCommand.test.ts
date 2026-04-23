import { describe, expect, it, vi } from "vitest";
import {
  executeInitSlashCommand,
  INIT_COMMAND_PROMPT,
} from "./composerInitCommand";

describe("composerInitCommand", () => {
  it("submits the official init prompt when a workspace is selected", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);

    await executeInitSlashCommand({
      selectedRootPath: "E:/code/codex-app-plus",
      selection: { model: "gpt-5.5", effort: "high", serviceTier: null },
      permissionLevel: "default",
      collaborationPreset: "default",
    }, {
      onSendTurn,
    });

    expect(onSendTurn).toHaveBeenCalledWith({
      text: INIT_COMMAND_PROMPT,
      attachments: [],
      selection: { model: "gpt-5.5", effort: "high", serviceTier: null },
      permissionLevel: "default",
      collaborationPreset: "default",
    });
  });

  it("fails explicitly when /init is used without a workspace", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);

    await expect(
      executeInitSlashCommand({
        selectedRootPath: null,
        selection: { model: "gpt-5.5", effort: "high", serviceTier: null },
        permissionLevel: "default",
        collaborationPreset: "default",
      }, {
        onSendTurn,
        workspaceRequiredMessage: "Please choose a workspace first.",
      }),
    ).rejects.toThrow("Please choose a workspace first.");
  });
});
