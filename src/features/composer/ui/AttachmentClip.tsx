interface AttachmentClipProps {
  readonly label: string;
  readonly tone: "image" | "file";
  readonly className?: string;
  readonly title?: string;
  readonly onRemove?: () => void;
}

export function AttachmentClip(props: AttachmentClipProps): JSX.Element {
  const className = props.className === undefined
    ? `attachment-clip attachment-clip-${props.tone}`
    : `attachment-clip attachment-clip-${props.tone} ${props.className}`;

  return (
    <span className={className} title={props.title}>
      <span className="attachment-clip-label">{props.label}</span>
      {props.onRemove === undefined ? null : (
        <button type="button" className="attachment-clip-remove" aria-label={`Remove ${props.label}`} onClick={props.onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
