import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AppServerClient } from "../../../protocol/appServerClient";
import { AppStoreProvider } from "../../../state/store";
import { useComposerPicker } from "./useComposerPicker";

function createAppServerClient(request: ReturnType<typeof vi.fn>): AppServerClient {
  return { request } as AppServerClient;
}

describe("useComposerPicker", () => {
  it("loads models only after the app server is initialized", async () => {
    const request = vi.fn().mockResolvedValue({
      data: [
        {
          id: "model-1",
          model: "gpt-5.3-codex",
          upgrade: null,
          upgradeInfo: null,
          availabilityNux: null,
          displayName: "GPT-5.3-Codex",
          description: "",
          hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: "high", description: "" }],
          defaultReasoningEffort: "high",
          inputModalities: [],
          supportsPersonality: false,
          isDefault: true
        }
      ],
      nextCursor: null
    });
    const appServerClient = createAppServerClient(request);
    function Wrapper({ children }: PropsWithChildren): JSX.Element {
      return <AppStoreProvider>{children}</AppStoreProvider>;
    }
    const { result, rerender } = renderHook(
      ({ ready }) => useComposerPicker(appServerClient, null, ready),
      { initialProps: { ready: false }, wrapper: Wrapper }
    );

    expect(request).not.toHaveBeenCalled();
    expect(result.current.models).toEqual([]);

    rerender({ ready: true });

    await waitFor(() => {
      expect(result.current.models).toHaveLength(5);
    });
    expect(result.current.models[0]).toEqual(expect.objectContaining({ value: "gpt-5.5" }));
    expect(request).toHaveBeenCalledTimes(1);
  });
});
