import type { ReactNode } from "react";

interface HomeEntryCardProps {
  readonly className: string;
  readonly title: string;
  readonly status?: string | null;
  readonly meta?: string | null;
  readonly children: ReactNode;
}

export function HomeEntryCard(props: HomeEntryCardProps): JSX.Element {
  return (
    <article className={props.className}>
      <header className="home-entry-card-header">
        <div className="home-entry-card-heading">
          <strong>{props.title}</strong>
          {props.status ? <span className="home-entry-card-status">{props.status}</span> : null}
        </div>
        {props.meta ? <span className="home-entry-card-meta">{props.meta}</span> : null}
      </header>
      <div className="home-entry-card-body">{props.children}</div>
    </article>
  );
}
