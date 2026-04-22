export type SettingsNavIconKind =
  | "general"
  | "appearance"
  | "config"
  | "agents"
  | "personalization"
  | "mcp"
  | "git"
  | "environment"
  | "worktree"
  | "about";

export function SettingsNavIcon(props: {
  readonly kind: SettingsNavIconKind;
  readonly className?: string;
}): JSX.Element {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (props.kind === "general") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="4" cy="4" r="1.5" fill="currentColor" />
        <path d="M6.8 4h5" {...common} />
        <circle cx="12" cy="8" r="1.5" fill="currentColor" />
        <path d="M4 8h6.2" {...common} />
        <circle cx="6.6" cy="12" r="1.5" fill="currentColor" />
        <path d="M9.4 12H12" {...common} />
      </svg>
    );
  }

  if (props.kind === "appearance") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" {...common} />
        <path d="M8 2.5v11" {...common} />
        <path d="M8 2.5a5.5 5.5 0 0 1 0 11" fill="currentColor" stroke="none" opacity="0.2" />
      </svg>
    );
  }

  if (props.kind === "config") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2.1" {...common} />
        <path d="M8 2.2v1.4M8 12.4v1.4M13.8 8h-1.4M3.6 8H2.2M12.1 3.9l-1 1M4.9 11.1l-1 1M12.1 12.1l-1-1M4.9 4.9l-1-1" {...common} />
      </svg>
    );
  }

  if (props.kind === "agents") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2" fill="currentColor" />
        <circle cx="8" cy="3.2" r="1.2" fill="currentColor" opacity="0.9" />
        <circle cx="12.2" cy="10.6" r="1.2" fill="currentColor" opacity="0.9" />
        <circle cx="3.8" cy="10.6" r="1.2" fill="currentColor" opacity="0.9" />
        <path d="M8 6V4.8M9.4 8.8l1.7 1M6.6 8.8l-1.7 1" {...common} />
      </svg>
    );
  }

  if (props.kind === "personalization") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="5.2" r="2.2" {...common} />
        <path d="M4.4 12.6a3.9 3.9 0 0 1 7.2 0" {...common} />
        <path d="M12.2 3l.35.95.95.35-.95.35-.35.95-.35-.95-.95-.35.95-.35Z" fill="currentColor" />
      </svg>
    );
  }

  if (props.kind === "mcp") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.1 5.2h3.8v5.6H6.1z" {...common} />
        <path d="M5.2 6.8H3.8M5.2 9.2H3.8M10.8 6.8h1.4M10.8 9.2h1.4" {...common} />
        <path d="M7 4V2.8M9 4V2.8M7.4 12.8h1.2" {...common} />
      </svg>
    );
  }

  if (props.kind === "git") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5" cy="3.2" r="1.4" fill="currentColor" />
        <circle cx="11" cy="7.8" r="1.4" fill="currentColor" />
        <circle cx="5" cy="12.4" r="1.4" fill="currentColor" />
        <path d="M5 4.6v6.4M6.3 3.8h2.7a2 2 0 0 1 2 2v0.6M9.6 8.6H6.8" {...common} />
      </svg>
    );
  }

  if (props.kind === "environment") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="3.1" width="11" height="8" rx="1.8" {...common} />
        <path d="M5.2 6.2L7 7.9 5.2 9.5M8.4 9.6h2.4" {...common} />
        <path d="M6.5 13h3" {...common} />
      </svg>
    );
  }

  if (props.kind === "worktree") {
    return (
      <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3.5" cy="4" r="1.2" fill="currentColor" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="12.5" cy="4" r="1.2" fill="currentColor" />
        <circle cx="8" cy="12" r="1.2" fill="currentColor" />
        <path d="M4.5 4h7M8 9.2V10.8M4.2 4.9L7.3 7M11.8 4.9L8.7 7" {...common} />
      </svg>
    );
  }

  return (
    <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" {...common} />
      <path d="M8 7V11" {...common} />
      <circle cx="8" cy="4.8" r="0.85" fill="currentColor" />
    </svg>
  );
}
