export function GitPushIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5.3 14.7h8.85c1.58 0 2.85-1.23 2.85-2.72 0-1.42-1.17-2.61-2.66-2.71A4.52 4.52 0 0 0 5.88 7.6 3.18 3.18 0 0 0 3 10.76c0 2.17 1.56 3.94 3.5 3.94Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 12.2V6.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m7.95 8.6 2.05-2.05L12.05 8.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitPullIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5.3 5.3h8.85c1.58 0 2.85 1.23 2.85 2.72 0 1.42-1.17 2.61-2.66 2.71A4.52 4.52 0 0 1 5.88 12.4 3.18 3.18 0 0 1 3 9.24c0-2.17 1.56-3.94 3.5-3.94Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 7.8v5.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m12.05 11.4-2.05 2.05L7.95 11.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitCommitIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.1" stroke="currentColor" strokeWidth="1.35" />
      <path d="m7.65 10.1 1.6 1.6 3.15-3.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitRefreshIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M16.8 10a6.8 6.8 0 1 1-6.8-6.8 6.8 6.8 0 0 1 5.05 2.25L16.8 6.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.8 2.7v4.1h-4.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GitBranchIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="6" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="6" cy="14.5" r="1.8" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="14.1" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6 7.3v5.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M7.8 5.5h2.9a3.4 3.4 0 0 1 3.4 3.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitDiffIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 5.5v9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M6 5.5H4.8a1.8 1.8 0 1 0 0 3.6H6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 14.5v-9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M14 14.5h1.2a1.8 1.8 0 1 0 0-3.6H14" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.4 10h3.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitStageIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4.8v10.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M4.8 10h10.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitRestoreIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6.1 8.1H3.9V5.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.1 8.1a6 6 0 1 1 1.5 5.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitChevronUpIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5.7 12.2 4.3-4.4 4.3 4.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitChevronDownIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5.7 7.8 4.3 4.4 4.3-4.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitDiffExpandIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 8.5v-4h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 11.5v4h-4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4.7 4.7 5.1 5.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m15.3 15.3-5.1-5.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitDiffCollapseIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M9.5 4.5v4h-4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 15.5v-4h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4.7 4.7 4.7 4.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m15.3 15.3-4.7-4.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitDiffSplitViewIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M10 4.5v11" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitDiffUnifiedViewIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.5 8.5h9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M5.5 11.5h9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function GitEmptyDiffIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M18 10.5h21l11 11V49a7 7 0 0 1-7 7H18a7 7 0 0 1-7-7V17.5a7 7 0 0 1 7-7Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M39 10.5V20a3 3 0 0 0 3 3h8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M25.5 31.5h13" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 25v13" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 42.5h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
