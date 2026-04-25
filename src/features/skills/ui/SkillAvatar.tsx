import { useEffect, useState } from "react";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

export function SkillAvatar(props: {
  readonly icon: string | null;
  readonly brandColor: string | null;
  readonly name: string;
}): JSX.Element {
  const [iconFailed, setIconFailed] = useState(false);
  const iconSrc = resolveIconSource(props.icon);

  useEffect(() => {
    setIconFailed(false);
  }, [iconSrc]);

  if (iconSrc !== null && !iconFailed) {
    return (
      <span className="skills-avatar skills-avatar-image">
        <img src={iconSrc} alt="" onError={() => setIconFailed(true)} />
      </span>
    );
  }

  return (
    <span
      className="skills-avatar"
      style={props.brandColor === null ? undefined : { background: props.brandColor }}
      aria-hidden="true"
    >
      {props.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function resolveIconSource(icon: string | null): string | null {
  const normalizedIcon = icon?.trim() ?? "";
  if (normalizedIcon.length === 0) {
    return null;
  }
  if (isBrowserLoadableUrl(normalizedIcon)) {
    return normalizedIcon;
  }
  if (!isLocalFilePath(normalizedIcon)) {
    return normalizedIcon;
  }
  if (!isTauri()) {
    return null;
  }
  return convertFileSrc(normalizeLocalFilePath(normalizedIcon));
}

function isBrowserLoadableUrl(value: string): boolean {
  return /^(https?:|data:|blob:|asset:)/i.test(value);
}

function isLocalFilePath(value: string): boolean {
  return /^file:\/\//i.test(value)
    || /^[a-zA-Z]:[\\/]/.test(value)
    || /^\\\\/.test(value)
    || value.startsWith("/");
}

function normalizeLocalFilePath(value: string): string {
  if (!value.toLowerCase().startsWith("file://")) {
    return value;
  }
  try {
    const parsed = new URL(value);
    const pathname = decodeURIComponent(parsed.pathname);
    if (parsed.host.length > 0) {
      return `//${parsed.host}${pathname}`;
    }
    if (/^\/[a-zA-Z]:\//.test(pathname)) {
      return pathname.slice(1);
    }
    return pathname;
  } catch {
    return value.replace(/^file:\/+/i, "");
  }
}
