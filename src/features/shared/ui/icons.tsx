export function CodexGlyph({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <defs>
        <linearGradient id="codex-glyph-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8a8cff" />
          <stop offset="1" stopColor="#3a60ff" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#codex-glyph-gradient)" />
      <path
        d="M8.2 8.4a3.8 3.8 0 0 1 5.2-1.5l2.4 1.3a3.6 3.6 0 0 1 0 6.2l-2.4 1.3a3.8 3.8 0 0 1-5.2-1.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="8.1" cy="12" r="1.8" fill="#fff" />
    </svg>
  );
}

export function SidebarIcon({ kind }: { readonly kind: "new-thread" | "automation" | "skills" }): JSX.Element {
  if (kind === "automation") {
    return (
      <svg className="sidebar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 5.5V8l1.7 1.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "skills") {
    return (
      <svg className="sidebar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.5" y="2" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="2" y="9.5" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  return (
    <svg className="sidebar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.4v7.2M4.4 8h7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function FolderIcon({ active }: { readonly active: boolean }): JSX.Element {
  if (active) {
    return (
      <svg className="thread-leading-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 4.2l5 3.8-5 3.8Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg className="thread-leading-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.4 4.8h4l1.1 1.4h6v5.6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function TopActionIcon(): JSX.Element {
  return (
    <svg className="top-action-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3.6L6.8 8 2 12.4h2.2l4.8-4.4-4.8-4.4Z" fill="#1473e6" />
      <path d="M14 3.6L9.2 8 14 12.4h-2.2L7 8l4.8-4.4Z" fill="#1473e6" />
    </svg>
  );
}
