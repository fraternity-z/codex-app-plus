import type { AgentEnvironment } from "../../bridge/types";

const WINDOWS_SEPARATOR = /\\/g;
const WINDOWS_DEVICE_PREFIX = /^(?:\\\\\?\\|\/\/\?\/)/;
const TRAILING_SEPARATOR = /\/+$/;
const WSL_UNC_PREFIX = /^\/\/(?:wsl\.localhost|wsl\$)\/([^/]+)(?:\/(.*))?$/i;
const WINDOWS_DRIVE_PATH = /^([A-Za-z]):\/(.*)$/;
const WSL_MOUNT_PATH = /^\/mnt\/([A-Za-z])(?:\/|$)/;

export function trimWorkspaceText(value: string): string {
  return value.trim();
}

function normalizePathSeparators(path: string): string {
  return path.replace(WINDOWS_SEPARATOR, "/");
}

function stripWindowsDevicePrefix(path: string): string {
  return path.replace(WINDOWS_DEVICE_PREFIX, "");
}

function trimTrailingSeparators(path: string): string {
  if (path === "/") {
    return path;
  }
  return path.replace(TRAILING_SEPARATOR, "");
}

function normalizeLinuxPath(path: string): string {
  const normalizedPath = trimTrailingSeparators(path.replace(/\/+/g, "/"));
  return normalizedPath.length === 0 ? "/" : normalizedPath;
}

function wslUncPathToLinuxPath(path: string): string | null {
  const match = path.match(WSL_UNC_PREFIX);
  if (match === null) {
    return null;
  }
  const [, , remainder = ""] = match;
  return normalizeLinuxPath(`/${remainder}`);
}

function windowsDrivePathToWslPath(path: string): string | null {
  const match = path.match(WINDOWS_DRIVE_PATH);
  if (match === null) {
    return null;
  }
  const [, drive, remainder] = match;
  const normalizedRemainder = trimTrailingSeparators(remainder);
  return normalizedRemainder.length === 0
    ? `/mnt/${drive.toLowerCase()}`
    : `/mnt/${drive.toLowerCase()}/${normalizedRemainder}`;
}

function normalizeAbsolutePath(path: string): string {
  const normalizedPath = stripWindowsDevicePrefix(normalizePathSeparators(trimWorkspaceText(path)));
  if (normalizedPath.length === 0) {
    return "";
  }

  const wslUncPath = wslUncPathToLinuxPath(normalizedPath);
  if (wslUncPath !== null) {
    return wslUncPath;
  }

  const wslDrivePath = windowsDrivePathToWslPath(normalizedPath);
  if (wslDrivePath !== null) {
    return wslDrivePath.toLowerCase();
  }

  if (normalizedPath.startsWith("/")) {
    const linuxPath = normalizeLinuxPath(normalizedPath);
    return WSL_MOUNT_PATH.test(linuxPath) ? linuxPath.toLowerCase() : linuxPath;
  }

  return trimTrailingSeparators(normalizedPath).toLowerCase();
}

export function normalizeWorkspacePath(path: string): string {
  return normalizeAbsolutePath(path);
}

export function resolveAgentWorkspacePath(
  path: string,
  agentEnvironment: AgentEnvironment
): string {
  const trimmedPath = trimWorkspaceText(path);
  if (trimmedPath.length === 0 || agentEnvironment === "windowsNative") {
    return trimmedPath;
  }

  const normalizedPath = stripWindowsDevicePrefix(normalizePathSeparators(trimmedPath));
  const wslUncPath = wslUncPathToLinuxPath(normalizedPath);
  if (wslUncPath !== null) {
    return wslUncPath;
  }

  const wslDrivePath = windowsDrivePathToWslPath(normalizedPath);
  if (wslDrivePath !== null) {
    return wslDrivePath;
  }

  if (normalizedPath.startsWith("/")) {
    return normalizeLinuxPath(normalizedPath);
  }

  throw new Error(`无法将路径转换为 WSL 路径: ${path}`);
}

export function inferWorkspaceNameFromPath(path: string): string {
  const normalizedPath = normalizePathSeparators(trimWorkspaceText(path)).replace(TRAILING_SEPARATOR, "");
  const parts = normalizedPath.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

