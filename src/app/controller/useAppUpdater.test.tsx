import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useAppSelector } from "../../state/store";
import { useAppUpdater } from "./useAppUpdater";

const updaterState = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  close: vi.fn(),
  relaunch: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => updaterState.getVersion(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => updaterState.relaunch(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => updaterState.check(),
}));

function wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

function useHarness() {
  const updater = useAppUpdater();
  const appUpdate = useAppSelector((state) => state.appUpdate);
  return { appUpdate, updater };
}

describe("useAppUpdater", () => {
  beforeEach(() => {
    updaterState.check.mockReset();
    updaterState.download.mockReset();
    updaterState.install.mockReset();
    updaterState.close.mockReset();
    updaterState.relaunch.mockReset();
    updaterState.getVersion.mockReset();
  });

  it("checks and downloads the latest release on startup", async () => {
    updaterState.getVersion.mockResolvedValue("0.1.0");
    updaterState.download.mockImplementation(async (handler: (event: unknown) => void) => {
      handler({ event: "Started", data: { contentLength: 1_024 } });
      handler({ event: "Progress", data: { chunkLength: 1_024 } });
    });
    updaterState.check.mockResolvedValue({
      currentVersion: "0.1.0",
      version: "0.2.0",
      body: "Release notes",
      download: updaterState.download,
      install: updaterState.install,
      close: updaterState.close,
    });

    const { result } = renderHook(() => useHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current.appUpdate.status).toBe("downloaded");
    });

    expect(result.current.appUpdate.currentVersion).toBe("0.1.0");
    expect(result.current.appUpdate.nextVersion).toBe("0.2.0");
    expect(updaterState.check).toHaveBeenCalledTimes(1);
    expect(updaterState.download).toHaveBeenCalledTimes(1);
  });

  it("installs a downloaded update and relaunches the app", async () => {
    updaterState.getVersion.mockResolvedValue("0.1.0");
    updaterState.download.mockImplementation(async () => undefined);
    updaterState.install.mockResolvedValue(undefined);
    updaterState.relaunch.mockResolvedValue(undefined);
    updaterState.check.mockResolvedValue({
      currentVersion: "0.1.0",
      version: "0.2.0",
      body: "Release notes",
      download: updaterState.download,
      install: updaterState.install,
      close: updaterState.close,
    });

    const { result } = renderHook(() => useHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current.appUpdate.status).toBe("downloaded");
    });

    await act(async () => {
      await result.current.updater.installAppUpdate();
    });

    expect(updaterState.install).toHaveBeenCalledTimes(1);
    expect(updaterState.relaunch).toHaveBeenCalledTimes(1);
  });
});
