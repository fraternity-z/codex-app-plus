import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";

export interface UserConfigWriteTarget {
  readonly filePath: string | null;
  readonly expectedVersion: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypedConfig(value: unknown): value is ConfigReadResponse {
  return isRecord(value) && isRecord(value.config);
}

export function readUserConfigWriteTarget(snapshot: unknown): UserConfigWriteTarget {
  if (!isTypedConfig(snapshot)) {
    return { filePath: null, expectedVersion: null };
  }

  const userLayer = snapshot.layers?.find((layer) => layer.name.type === "user") ?? null;
  if (userLayer?.name.type !== "user") {
    return { filePath: null, expectedVersion: null };
  }

  return {
    filePath: userLayer.name.file,
    expectedVersion: userLayer.version
  };
}
