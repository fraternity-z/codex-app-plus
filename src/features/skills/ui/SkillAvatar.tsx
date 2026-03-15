import { useState } from "react";

export function SkillAvatar(props: {
  readonly icon: string | null;
  readonly brandColor: string | null;
  readonly name: string;
}): JSX.Element {
  const [iconFailed, setIconFailed] = useState(false);
  if (props.icon !== null && !iconFailed) {
    return (
      <span className="skills-avatar skills-avatar-image">
        <img src={props.icon} alt="" onError={() => setIconFailed(true)} />
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
