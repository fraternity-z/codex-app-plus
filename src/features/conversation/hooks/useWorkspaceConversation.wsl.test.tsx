import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { AppStoreProvider } from "../../../state/store";
import { DEFAULT_COMPOSER_PERMISSION_SETTINGS } from "../../composer/model/composerPermission";
import { useWorkspaceConversation } from "./useWorkspaceConversation";

function Wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

function createThread(id: string, cwd: string) {
  return {
    id,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 1,
    status: { type: "idle" as const },
    path: null,
    cwd,
    cliVersion: "0.1.0",
    source: "appServer" as const,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
  };
}

describe("useWorkspaceConversation WSL cwd", () => {
  it("maps Windows workspaces and attachments to WSL paths for thread/start and turn/start", async () => {
    const request = vi.fn(async (input: { readonly method: string; readonly params: Record<string, unknown> }) => {
      if (input.method === "thread/start") {
        return {
          requestId: "request-thread",
          result: { thread: createThread("thread-1", "/mnt/e/code/FPGA"), cwd: "/mnt/e/code/FPGA" }
        };
      }
      if (input.method === "turn/start") {
        return {
          requestId: "request-turn",
          result: { turn: { id: "turn-1", items: [], status: "inProgress", error: null } }
        };
      }
      throw new Error(`unexpected method: ${input.method}`);
    });
    const hostBridge = {
      rpc: { request, notify: vi.fn(), cancel: vi.fn() },
      app: {}
    } as unknown as HostBridge;

    const { result } = renderHook(
      () => useWorkspaceConversation({
        agentEnvironment: "wsl",
        hostBridge,
        selectedRootPath: "E:/code/FPGA",
        collaborationModes: [{ name: "plan", mode: "plan", model: "gpt-5.2", reasoningEffort: "medium" }],
        steerAvailable: true,
        followUpQueueMode: "queue",
        permissionSettings: DEFAULT_COMPOSER_PERMISSION_SETTINGS,
      }),
      { wrapper: Wrapper }
    );

    await act(async () => {
      await result.current.createThread();
      await result.current.sendTurn({
        text: "hello",
        attachments: [
          { id: "image-1", kind: "image", source: "localImage", name: "image.png", value: "E:/code/FPGA/image.png" },
          { id: "file-1", kind: "file", source: "mention", name: "notes.md", value: "E:/code/FPGA/notes.md" },
        ],
        selection: { model: "gpt-5.2", effort: "medium", serviceTier: null },
        permissionLevel: "default",
        collaborationPreset: "default"
      });
    });

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "thread/start",
      params: expect.objectContaining({ cwd: "/mnt/e/code/FPGA" })
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        cwd: "/mnt/e/code/FPGA",
        input: [
          { type: "text", text: "hello", text_elements: [] },
          { type: "localImage", path: "/mnt/e/code/FPGA/image.png" },
          { type: "mention", name: "notes.md", path: "/mnt/e/code/FPGA/notes.md" },
        ],
      })
    }));
  });
});
