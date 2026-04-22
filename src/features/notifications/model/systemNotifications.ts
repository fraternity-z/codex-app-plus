import type { HostBridge } from "../../../bridge/types";

type SendNotificationModule = typeof import("@tauri-apps/plugin-notification");
type AppBridge = Pick<HostBridge, "app">["app"];

let notificationPermissionGranted: boolean | null = null;

export type SystemNotificationResult =
  | { readonly status: "sent" }
  | { readonly status: "permissionDenied" }
  | { readonly status: "pluginFailed"; readonly error: unknown };

export type NotificationDeliveryResult =
  | { readonly status: "sent"; readonly via: "system" }
  | {
      readonly status: "sent";
      readonly via: "app";
      readonly fallbackReason: Exclude<SystemNotificationResult["status"], "sent">;
    }
  | {
      readonly status: "failed";
      readonly reason: Exclude<SystemNotificationResult["status"], "sent"> | "appFallbackFailed";
      readonly error: unknown;
    };

async function resolveNotificationPermission(
  notification: SendNotificationModule,
): Promise<boolean> {
  if (notificationPermissionGranted === true) {
    return true;
  }

  let permissionGranted =
    notificationPermissionGranted ??
    (await notification.isPermissionGranted());

  if (!permissionGranted) {
    const permission = await notification.requestPermission();
    permissionGranted = permission === "granted";
  }

  notificationPermissionGranted = permissionGranted;
  return permissionGranted;
}

export function resetSystemNotificationPermissionForTests(): void {
  notificationPermissionGranted = null;
}

export async function sendSystemNotification(
  title: string,
  body: string,
): Promise<SystemNotificationResult> {
  try {
    const notification = await import("@tauri-apps/plugin-notification");
    const permissionGranted = await resolveNotificationPermission(notification);
    if (!permissionGranted) {
      return { status: "permissionDenied" };
    }

    await notification.sendNotification({
      title,
      body,
      autoCancel: true,
    });
    return { status: "sent" };
  } catch (error) {
    return { status: "pluginFailed", error };
  }
}

// Windows toast notifications may silently succeed without actually displaying.
// Taskbar flashing is universally reliable and serves as a complementary signal.
export async function requestWindowAttention(critical = true): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().requestUserAttention(critical ? 2 : 1);
  } catch {
    // Non-Tauri environment or window not available
  }
}

export async function deliverNotification(
  app: AppBridge,
  title: string,
  body: string,
): Promise<NotificationDeliveryResult> {
  // Layer 1: In-app toast — always reliable, visible when user returns to the app
  void app.showNotification({ title, body }).catch(() => {});

  // Layer 2: Taskbar flash — reliable on Windows, draws attention when app is in background
  void requestWindowAttention();

  // Layer 3: System toast — best-effort, may silently fail on some Windows configurations
  const systemResult = await sendSystemNotification(title, body);
  if (systemResult.status === "sent") {
    return { status: "sent", via: "system" };
  }

  return {
    status: "sent",
    via: "app",
    fallbackReason: systemResult.status,
  };
}
