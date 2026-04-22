// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    requestUserAttention: vi.fn().mockResolvedValue(undefined),
  })),
}));

import * as notification from "@tauri-apps/plugin-notification";
import {
  deliverNotification,
  requestWindowAttention,
  resetSystemNotificationPermissionForTests,
  sendSystemNotification,
} from "./systemNotifications";

describe("sendSystemNotification", () => {
  beforeEach(() => {
    resetSystemNotificationPermissionForTests();
    vi.clearAllMocks();
  });

  it("sends immediately when permission is already granted", async () => {
    vi.mocked(notification.isPermissionGranted).mockResolvedValueOnce(true);

    const sent = await sendSystemNotification("Hello", "World");

    expect(sent).toEqual({ status: "sent" });
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(notification.sendNotification).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
      autoCancel: true,
    });
  });

  it("returns false without sending when permission is denied", async () => {
    vi.mocked(notification.isPermissionGranted).mockResolvedValueOnce(false);
    vi.mocked(notification.requestPermission).mockResolvedValueOnce("denied");

    const sent = await sendSystemNotification("Hello", "World");

    expect(sent).toEqual({ status: "permissionDenied" });
    expect(notification.sendNotification).not.toHaveBeenCalled();
  });
});

describe("deliverNotification", () => {
  beforeEach(() => {
    resetSystemNotificationPermissionForTests();
    vi.clearAllMocks();
  });

  it("always shows in-app toast even when system notification succeeds", async () => {
    vi.mocked(notification.isPermissionGranted).mockResolvedValueOnce(true);
    const app = {
      showNotification: vi.fn().mockResolvedValue(undefined),
    } as const;

    const result = await deliverNotification(app as never, "Hello", "World");

    expect(result).toEqual({ status: "sent", via: "system" });
    expect(app.showNotification).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
    });
  });

  it("shows in-app toast and reports app fallback when system path is denied", async () => {
    vi.mocked(notification.isPermissionGranted).mockResolvedValueOnce(false);
    vi.mocked(notification.requestPermission).mockResolvedValueOnce("denied");
    const app = {
      showNotification: vi.fn().mockResolvedValue(undefined),
    } as const;

    const result = await deliverNotification(app as never, "Hello", "World");

    expect(result).toEqual({
      status: "sent",
      via: "app",
      fallbackReason: "permissionDenied",
    });
    expect(app.showNotification).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
    });
  });
});

describe("requestWindowAttention", () => {
  it("calls requestUserAttention with critical level by default", async () => {
    const mockAttention = vi.fn().mockResolvedValue(undefined);
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    vi.mocked(getCurrentWindow).mockReturnValue({
      requestUserAttention: mockAttention,
    } as never);

    await requestWindowAttention();

    expect(mockAttention).toHaveBeenCalledWith(2);
  });

  it("calls requestUserAttention with informational level when critical is false", async () => {
    const mockAttention = vi.fn().mockResolvedValue(undefined);
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    vi.mocked(getCurrentWindow).mockReturnValue({
      requestUserAttention: mockAttention,
    } as never);

    await requestWindowAttention(false);

    expect(mockAttention).toHaveBeenCalledWith(1);
  });
});
