import type { ReactNode } from "react";

interface HomePromptCardProps {
  readonly ariaLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly headerAside?: ReactNode;
  readonly bodyClassName?: string;
  readonly className?: string;
  readonly actions: ReactNode;
  readonly children: ReactNode;
}

export function HomePromptCard(props: HomePromptCardProps): JSX.Element {
  const cardClassName = props.className
    ? `plan-request-composer ${props.className}`
    : "plan-request-composer";
  const bodyClassName = props.bodyClassName
    ? `plan-request-body ${props.bodyClassName}`
    : "plan-request-body";

  return (
    <footer className="composer-area">
      <section className={cardClassName} aria-label={props.ariaLabel}>
        <div className="plan-request-header">
          <div>
            <p className="plan-request-title">{props.title}</p>
            <p className="plan-request-subtitle">{props.subtitle}</p>
          </div>
          {props.headerAside ?? null}
        </div>
        <div className={bodyClassName}>{props.children}</div>
        <div className="plan-request-actions">{props.actions}</div>
      </section>
    </footer>
  );
}
