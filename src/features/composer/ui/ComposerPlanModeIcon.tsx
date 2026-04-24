import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function ComposerPlanModeIcon(props: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 5.5h1.5m2 0h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 10h4.5m2 0h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 14.5h1.5m2 0h5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.5" cy="5.5" r="1" fill="currentColor" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="6.5" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}
