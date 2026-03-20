import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "../../../state/store";
import { useWorkspaceSwitchTracker } from "./useWorkspaceSwitchTracker";

function Wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

describe("useWorkspaceSwitchTracker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for git state to reset before completing a new workspace switch", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result, rerender } = renderHook(
      (props: {
        readonly selectedRootId: string | null;
        readonly selectedRootPath: string | null;
        readonly gitError: string | null;
        readonly gitLoading: boolean;
        readonly gitStatusLoaded: boolean;
      }) => useWorkspaceSwitchTracker(props),
      {
        initialProps: {
          selectedRootId: "root-1",
          selectedRootPath: "E:/code/FPGA",
          gitError: null,
          gitLoading: false,
          gitStatusLoaded: true,
        },
        wrapper: Wrapper,
      },
    );

    await waitFor(() => expect(result.current.phase).toBe("switching"));

    rerender({
      selectedRootId: "root-1",
      selectedRootPath: "E:/code/FPGA",
      gitError: null,
      gitLoading: false,
      gitStatusLoaded: false,
    });
    expect(result.current.phase).toBe("switching");

    rerender({
      selectedRootId: "root-1",
      selectedRootPath: "E:/code/FPGA",
      gitError: null,
      gitLoading: true,
      gitStatusLoaded: false,
    });
    expect(result.current.phase).toBe("switching");

    rerender({
      selectedRootId: "root-1",
      selectedRootPath: "E:/code/FPGA",
      gitError: null,
      gitLoading: false,
      gitStatusLoaded: true,
    });

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.durationMs).not.toBeNull();
  });
});
