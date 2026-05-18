import { describe, expect, it } from "vitest";
import { INITIAL_STATE } from "../../../domain/types";
import { reduceAppUpdateState } from "./appUpdateReducer";

describe("appUpdateReducer", () => {
  it("tracks an available update through download completion", () => {
    const checkingState = reduceAppUpdateState(INITIAL_STATE, {
      type: "appUpdate/checkStarted",
    });
    const availableState = reduceAppUpdateState(checkingState ?? INITIAL_STATE, {
      type: "appUpdate/available",
      currentVersion: "0.1.0",
      nextVersion: "0.2.0",
      notes: "notes",
      checkedAt: "2026-03-19T09:00:00.000Z",
    });
    const progressState = reduceAppUpdateState(availableState ?? INITIAL_STATE, {
      type: "appUpdate/downloadProgress",
      downloadedBytes: 512,
      totalBytes: 1_024,
      progressPercent: 0.5,
    });
    const downloadedState = reduceAppUpdateState(progressState ?? INITIAL_STATE, {
      type: "appUpdate/downloaded",
    });

    expect(downloadedState?.appUpdate).toEqual(expect.objectContaining({
      status: "downloaded",
      currentVersion: "0.1.0",
      nextVersion: "0.2.0",
      progressPercent: 1,
    }));
  });

  it("clears version-specific metadata when the app is up to date", () => {
    const stateWithUpdate = reduceAppUpdateState(INITIAL_STATE, {
      type: "appUpdate/available",
      currentVersion: "0.1.0",
      nextVersion: "0.2.0",
      notes: "notes",
      checkedAt: "2026-03-19T09:00:00.000Z",
    });
    const upToDateState = reduceAppUpdateState(stateWithUpdate ?? INITIAL_STATE, {
      type: "appUpdate/upToDate",
      checkedAt: "2026-03-19T09:05:00.000Z",
    });

    expect(upToDateState?.appUpdate).toEqual(expect.objectContaining({
      status: "upToDate",
      nextVersion: null,
      notes: null,
      lastCheckedAt: "2026-03-19T09:05:00.000Z",
    }));
  });

  it("clears pending update metadata when updates are disabled", () => {
    const stateWithUpdate = reduceAppUpdateState(INITIAL_STATE, {
      type: "appUpdate/available",
      currentVersion: "0.1.0",
      nextVersion: "0.2.0",
      notes: "notes",
      checkedAt: "2026-03-19T09:00:00.000Z",
    });
    const disabledState = reduceAppUpdateState(stateWithUpdate ?? INITIAL_STATE, {
      type: "appUpdate/disabled",
    });

    expect(disabledState?.appUpdate).toEqual(expect.objectContaining({
      status: "disabled",
      nextVersion: null,
      notes: null,
      downloadedBytes: 0,
      totalBytes: null,
      progressPercent: null,
      error: null,
    }));
  });
});
