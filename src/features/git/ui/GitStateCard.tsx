interface GitStateCardProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly className?: string;
}

export function GitStateCard(props: GitStateCardProps): JSX.Element {
  return (
    <section className={props.className ?? "git-state-card"}>
      <h2 className="git-state-title">{props.title}</h2>
      <p className="git-state-body">{props.body}</p>
      {props.actionLabel !== undefined && props.onAction !== undefined ? (
        <button type="button" className="git-primary-btn" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </section>
  );
}
