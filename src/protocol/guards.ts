function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mustString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} 必须是非空字符串`);
  }
  return value;
}

export interface EnvelopeLike {
  readonly method: string;
  readonly params: unknown;
}

export interface RequestEnvelopeLike extends EnvelopeLike {
  readonly id: string;
}

export function parseNotificationEnvelope(value: unknown): EnvelopeLike {
  if (!isRecord(value)) {
    throw new Error("notification payload 必须是对象");
  }
  return {
    method: mustString(value.method, "notification.method"),
    params: value.params
  };
}

export function parseServerRequestEnvelope(value: unknown): RequestEnvelopeLike {
  if (!isRecord(value)) {
    throw new Error("serverRequest payload 必须是对象");
  }
  return {
    id: mustString(value.id, "serverRequest.id"),
    method: mustString(value.method, "serverRequest.method"),
    params: value.params
  };
}

export function parseConnectionStatus(value: unknown): "disconnected" | "connecting" | "connected" | "error" {
  if (
    value === "disconnected" ||
    value === "connecting" ||
    value === "connected" ||
    value === "error"
  ) {
    return value;
  }
  throw new Error(`未知连接状态: ${String(value)}`);
}
